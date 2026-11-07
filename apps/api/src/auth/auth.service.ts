import type { LoginInput, SessionAccount } from '@mijote/shared';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { ProblemException } from '../errors/problem.exception.js';
import { decoyPasswordDigest, verifyPassword } from '../security/passwords.js';

import { AttemptsService } from './attempts.service.js';
import type { AuthLog } from './auth.log.js';
import { clearedCookies, csrfCookie, rememberCookie, sessionCookie } from './auth.cookies.js';
import { type AccountRecord, AuthRepository } from './auth.repository.js';
import { RememberService } from './remember.service.js';
import { type Authenticated, SessionService } from './session.service.js';

/*
  La connexion, la reprise de session et la déconnexion.

  Le service rend les en-têtes `Set-Cookie` à poser, et le contrôleur ne fait
  que les écrire : la politique des cookies reste ainsi d'un seul côté, celui
  qui sait ce qu'il vient d'ouvrir.
*/

/**
 * Le seul message d'échec de connexion, identique dans tous les cas.
 *
 * Adresse inconnue ou mot de passe faux, la réponse ne dit pas lequel : sinon
 * le formulaire deviendrait un moyen de savoir qui a un compte ici. Le temps de
 * réponse non plus ne le dit pas, d'où l'empreinte leurre de passwords.ts.
 */
const INVALID_CREDENTIALS = 'Adresse e-mail ou mot de passe incorrect.';

const TOO_MANY_ATTEMPTS = 'Trop de tentatives de connexion. Réessayez dans quelques minutes.';

/** Ce que la connexion lit des comptes, et rien de plus. */
export interface AccountStore {
  findAccountByEmail(email: string): Promise<AccountRecord | undefined>;
  findAccountById(id: string): Promise<AccountRecord | undefined>;
}

/** Ce que le service rend au contrôleur : le compte, et les cookies à poser. */
export interface AuthenticatedResponse {
  account: SessionAccount;
  cookies: string[];
}

/** Le compte tel qu'il part au navigateur : jamais l'empreinte du mot de passe. */
function toSessionAccount(account: AccountRecord): SessionAccount {
  return {
    id: account.id,
    email: account.email,
    householdId: account.householdId,
    role: account.role,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthRepository) private readonly accounts: AccountStore,
    private readonly sessions: SessionService,
    private readonly remember: RememberService,
    private readonly attempts: AttemptsService,
    @Inject(PinoLogger) private readonly logger: AuthLog,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async login(
    input: LoginInput,
    clientIp: string,
    presentedSession?: string,
  ): Promise<AuthenticatedResponse> {
    const keys = this.attempts.keysFor(input.email, clientIp);

    if (await this.attempts.isBlocked(keys)) {
      await this.attempts.record(keys, 'blocked');
      // Les empreintes et rien d'autre : elles suffisent à relier les lignes
      // entre elles sans écrire ni l'adresse ni l'IP (security.md).
      this.logger.warn(keys, 'connexion bloquée par la limitation');

      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS);
    }

    const account = await this.accounts.findAccountByEmail(input.email);

    /*
      Une adresse inconnue fait quand même vérifier un mot de passe, contre une
      empreinte leurre : sans cela, elle répondrait sans payer les 110 ms
      d'Argon2, et le temps de réponse dirait quels comptes existent.
    */
    const digest = account?.passwordHash ?? (await decoyPasswordDigest());
    const correct = await verifyPassword(digest, input.password);

    if (account === undefined || !correct) {
      await this.attempts.record(keys, 'failed');
      /*
        Les empreintes et rien d'autre. Dire si le compte existe serait, pour
        qui lit les journaux et détient le poivre, le moyen de confirmer qu'une
        adresse devinée a un compte ici.
      */
      this.logger.info(keys, 'échec de connexion');

      throw new ProblemException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
    }

    await this.attempts.record(keys, 'succeeded');

    if (presentedSession !== undefined) {
      await this.sessions.closePresented(presentedSession);
    }

    const cookies = await this.openSession(account.id, input.remember);

    // La purge vit ici : une connexion réussie est assez fréquente pour que
    // rien ne s'accumule, et trop rare pour qu'elle coûte.
    await this.attempts.purge();
    this.logger.info({ accountId: account.id, remember: input.remember }, 'connexion réussie');

    return { account: toSessionAccount(account), cookies };
  }

  /**
   * Qui est connecté, en reprenant au besoin une session mémorisée.
   *
   * Appelée par `GET /auth/session`. Le cookie CSRF est reposé au passage :
   * lisible par le script, il peut avoir disparu là où le cookie de session est
   * resté, et il se retrouve dans la ligne de la session.
   */
  async current(cookies: {
    session: string | undefined;
    remember: string | undefined;
  }): Promise<AuthenticatedResponse | undefined> {
    if (cookies.session !== undefined) {
      const authenticated = await this.sessions.resolve(cookies.session);

      if (authenticated !== undefined) {
        return {
          account: toSessionAccount(authenticated.account),
          cookies: [csrfCookie(authenticated.session.csrfSecret)],
        };
      }
    }

    return cookies.remember === undefined ? undefined : this.resume(cookies.remember);
  }

  /**
   * Reprend une session depuis le cookie de mémorisation.
   *
   * C'est le seul endroit qui le fait : les gardes ne font que lire une session
   * existante. Le front appelle donc `GET /auth/session` au démarrage, et c'est
   * là qu'un navigateur rouvert retrouve son compte.
   */
  async resume(rememberValue: string): Promise<AuthenticatedResponse | undefined> {
    const resumed = await this.remember.consume(rememberValue);

    if (resumed === undefined) {
      return undefined;
    }

    const account = await this.accounts.findAccountById(resumed.accountId);

    if (account === undefined) {
      // Compte supprimé entre-temps : le jeton ne vaut plus rien.
      return undefined;
    }

    const cookies = await this.openSession(account.id, false);

    if (resumed.refreshed !== undefined) {
      cookies.push(rememberCookie(resumed.refreshed));
    }

    this.logger.info({ accountId: account.id }, 'session reprise par la mémorisation');

    return { account: toSessionAccount(account), cookies };
  }

  /**
   * Ferme la session et, s'il y en a un, le jeton de mémorisation présenté.
   *
   * Seul l'appareil courant est déconnecté : les autres gardent leur session et
   * leur famille de jetons. Révoquer tous les appareils est hors périmètre de
   * la story #10.
   */
  async logout(authenticated: Authenticated, rememberValue: string | undefined): Promise<string[]> {
    await this.sessions.close(authenticated.session.id);

    if (rememberValue !== undefined) {
      await this.remember.revoke(rememberValue, authenticated.account.id);
    }

    this.logger.info({ accountId: authenticated.account.id }, 'déconnexion');

    return clearedCookies();
  }

  private async openSession(accountId: string, remember: boolean): Promise<string[]> {
    const opened = await this.sessions.open(accountId);
    const cookies = [sessionCookie(opened.token), csrfCookie(opened.csrfSecret)];

    if (remember) {
      cookies.push(rememberCookie(await this.remember.issue(accountId)));
    }

    return cookies;
  }
}
