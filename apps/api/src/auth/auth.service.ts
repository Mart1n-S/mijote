import type { LoginInput, SessionAccount, TwoFactorState } from '@mijote/shared';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { ProblemException } from '../errors/problem.exception.js';
import type { BackupCode } from '../security/backup-codes.js';
import { decoyPasswordDigest, verifyPassword } from '../security/passwords.js';

import { type AttemptKeys, AttemptsService } from './attempts.service.js';
import type { AuthLog } from './auth.log.js';
import {
  clearedCookies,
  csrfCookie,
  expirePendingCookie,
  pendingCookie,
  rememberCookie,
  sessionCookie,
} from './auth.cookies.js';
import { type AccountRecord, AuthRepository } from './auth.repository.js';
import { type PendingLogin, PendingLoginService } from './pending-login.service.js';
import { RememberService } from './remember.service.js';
import { type Authenticated, SessionService } from './session.service.js';
import { TwoFactorService } from './two-factor.service.js';

/*
  La connexion, la reprise de session, le second facteur et la déconnexion.

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

const TOO_MANY_CODES = 'Trop de codes incorrects. Réessayez dans quelques minutes.';

/**
 * Le seul message de code refusé.
 *
 * Code faux, code de secours déjà consommé, numéro qui n'existe pas, rejeu :
 * tous reçoivent celui-ci, et le même temps de réponse.
 */
const INVALID_CODE = 'Code incorrect ou expiré.';

/**
 * La seule exception, et elle ne dépend d'aucune donnée en base : une suite de
 * lettres sans son numéro n'a pas la forme d'un code de secours.
 */
const MALFORMED_BACKUP_CODE =
  'Un code de secours commence par son numéro, par exemple 3-ABCD-EFGH-JKLM.';

/** Redemandé pour activer ou désactiver le second facteur. */
const WRONG_PASSWORD = 'Mot de passe incorrect.';

const TOO_MANY_PASSWORDS = 'Trop de mots de passe incorrects. Réessayez dans quelques minutes.';

/**
 * Le second facteur ne concerne que l'administrateur dans ce lot.
 *
 * Sans ce refus, un compte ordinaire qui taperait l'adresse de l'écran
 * pourrait inscrire une application, puis ne plus pouvoir la retirer, aucun
 * écran ne le proposant (ADR 0012).
 */
const ADMIN_ONLY = "La double authentification ne concerne que les comptes d'administration.";

/** Ce que la connexion lit des comptes, et rien de plus. */
export interface AccountStore {
  findAccountByEmail(email: string): Promise<AccountRecord | undefined>;
  findAccountById(id: string): Promise<AccountRecord | undefined>;
}

/** Ce que le service rend au contrôleur : le compte, et les cookies à poser. */
export interface AuthenticatedResponse {
  account: SessionAccount;
  twoFactor: TwoFactorState;
  cookies: string[];
}

/**
 * Ce qu'il rend quand le mot de passe est bon mais qu'un code est attendu.
 *
 * Aucune session n'est ouverte : les cookies posés sont ceux de l'attente, qui
 * ne permettent que de soumettre le code (ADR 0012).
 */
export interface TwoFactorPendingResponse {
  twoFactorRequired: true;
  cookies: string[];
}

export type LoginResult = AuthenticatedResponse | TwoFactorPendingResponse;

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
    private readonly pending: PendingLoginService,
    private readonly twoFactor: TwoFactorService,
    @Inject(PinoLogger) private readonly logger: AuthLog,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async login(
    input: LoginInput,
    clientIp: string,
    presentedSession?: string,
  ): Promise<LoginResult> {
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

    /*
      La session précédente de ce navigateur est fermée dès le mot de passe, et
      non après le code : quelqu'un vient de prouver qu'il connaît le mot de
      passe du compte, et c'est déjà une raison de ne pas laisser l'ancienne
      session ouverte.
    */
    if (presentedSession !== undefined) {
      await this.sessions.closePresented(presentedSession);
    }

    if (await this.twoFactor.isActive(account.id)) {
      const waiting = await this.pending.open(account.id, input.remember);

      this.logger.info({ accountId: account.id }, 'second facteur attendu');

      return {
        twoFactorRequired: true,
        cookies: [pendingCookie(waiting.token), csrfCookie(waiting.csrfSecret)],
      };
    }

    const cookies = await this.openSession(account.id, input.remember);

    // La purge vit ici : une connexion réussie est assez fréquente pour que
    // rien ne s'accumule, et trop rare pour qu'elle coûte.
    await this.attempts.purge();
    this.logger.info({ accountId: account.id, remember: input.remember }, 'connexion réussie');

    return {
      account: toSessionAccount(account),
      twoFactor: { active: false },
      cookies,
    };
  }

  /**
   * Le second facteur, après le mot de passe : c'est ici que la session s'ouvre.
   *
   * L'attente est détruite avant, et la session reçoit un jeton neuf : rien de
   * ce qui a servi à attendre ne sert ensuite. La session naît avec ses droits
   * d'administration ouverts, le code venant d'être validé.
   */
  async completeTwoFactor(
    waiting: PendingLogin,
    code: string,
    clientIp: string,
  ): Promise<AuthenticatedResponse> {
    const kind = await this.checkCode(waiting.accountId, code, clientIp, async () => {
      /*
        Un essai raté compte aussi sur l'attente elle-même : au cinquième, elle
        est détruite et il faut repasser par le mot de passe. La fenêtre
        glissante, elle, survit à cette destruction.
      */
      await this.pending.countFailedAttempt(waiting.id);
    });

    await this.pending.close(waiting.id);

    const cookies = await this.openSession(waiting.accountId, waiting.remember, new Date());

    cookies.push(expirePendingCookie());

    await this.attempts.purge();
    this.logger.info({ accountId: waiting.accountId, kind }, 'second facteur validé');

    return {
      account: toSessionAccount(waiting.account),
      twoFactor: { active: true },
      cookies,
    };
  }

  /**
   * Ouvre les droits d'administration d'une session déjà ouverte.
   *
   * C'est le chemin d'une session reprise par le cookie de mémorisation : elle
   * vaut pour l'application, et le code lui ouvre l'administration (ADR 0012).
   */
  async unlockAdmin(authenticated: Authenticated, code: string, clientIp: string): Promise<void> {
    this.requireAdmin(authenticated.account);

    const kind = await this.checkCode(authenticated.account.id, code, clientIp);

    await this.sessions.unlockAdmin(authenticated.session.id);
    this.logger.info({ accountId: authenticated.account.id, kind }, 'administration déverrouillée');
  }

  /**
   * Commence l'inscription d'une application d'authentification.
   *
   * Le mot de passe est redemandé, comme à la désactivation : sans cela, une
   * session volée d'un administrateur sans second facteur inscrirait
   * l'application de l'attaquant, obtiendrait l'administration et
   * verrouillerait le propriétaire.
   */
  async startTwoFactorSetup(
    authenticated: Authenticated,
    password: string,
    clientIp: string,
  ): Promise<{ uri: string; key: string }> {
    this.requireAdmin(authenticated.account);
    await this.confirmPassword(authenticated.account, password, clientIp);

    return this.twoFactor.startSetup(authenticated.account);
  }

  /** Confirme l'inscription par un premier code, et rend les codes de secours. */
  async activateTwoFactor(
    authenticated: Authenticated,
    password: string,
    code: string,
    clientIp: string,
  ): Promise<BackupCode[]> {
    this.requireAdmin(authenticated.account);
    await this.confirmPassword(authenticated.account, password, clientIp);

    const accountId = authenticated.account.id;
    /*
      Le code de l'activation est compté comme les trois autres. Le gain pour un
      attaquant est nul, le secret étant celui qu'il vient de recevoir, mais
      « les essais de code sont limités » ne souffre pas d'exception, et cette
      route serait sinon la seule sans compteur.
    */
    const keys = await this.startCodeAttempt(accountId, clientIp);
    const activated = await this.twoFactor.activate(accountId, code);

    if (activated.verdict !== 'totp') {
      throw await this.refuseCode(
        keys,
        accountId,
        activated.verdict === 'malformed' ? 'malformed' : 'invalid',
      );
    }

    await this.acceptCode(keys);

    /*
      Activer, c'est valider un code : la session courante gagne donc ses droits
      d'administration sans en redemander un second.
    */
    await this.sessions.unlockAdmin(authenticated.session.id);

    return activated.codes;
  }

  /**
   * Désactive le second facteur, mot de passe et code exigés.
   *
   * Les deux, parce que c'est aussi le chemin du téléphone perdu : le code de
   * secours y sert, et le mot de passe empêche qu'une session volée le
   * désactive.
   */
  async disableTwoFactor(
    authenticated: Authenticated,
    password: string,
    code: string,
    clientIp: string,
  ): Promise<void> {
    this.requireAdmin(authenticated.account);
    await this.confirmPassword(authenticated.account, password, clientIp);
    await this.checkCode(authenticated.account.id, code, clientIp);
    await this.twoFactor.disable(authenticated.account.id);
  }

  /**
   * Ouvre une session pour un compte qui vient d'être créé.
   *
   * Appelée par l'acceptation d'une invitation : la personne vient de prouver
   * qu'elle contrôle son adresse et de choisir son mot de passe, lui redemander
   * de se connecter serait de la friction sans gain.
   *
   * Aucune mémorisation, et aucun déverrouillage d'administration : un compte
   * invité comme administrateur devra d'abord inscrire son second facteur, puis
   * se déverrouiller par un code (ADR 0012).
   */
  async openSessionFor(accountId: string): Promise<AuthenticatedResponse> {
    const found = await this.accounts.findAccountById(accountId);

    if (found === undefined) {
      throw new Error("le compte qui vient d'être créé est introuvable");
    }

    const cookies = await this.openSession(accountId, false);

    this.logger.info({ accountId }, 'session ouverte après inscription');

    return {
      account: toSessionAccount(found),
      twoFactor: { active: false },
      cookies,
    };
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
          twoFactor: { active: await this.twoFactor.isActive(authenticated.account.id) },
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
   *
   * La session reprise naît **sans** droits d'administration : le cookie de
   * mémorisation rouvre l'application, pas l'administration (ADR 0012).
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

    return {
      account: toSessionAccount(account),
      twoFactor: { active: await this.twoFactor.isActive(account.id) },
      cookies,
    };
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

  /**
   * Vérifie un code, avec sa limitation et son journal.
   *
   * `onFailure` sert à l'attente, qui compte en plus ses propres essais. Il
   * n'est pas appelé quand la limitation a déjà refusé : seul un vrai essai
   * compte.
   */
  private async checkCode(
    accountId: string,
    code: string,
    clientIp: string,
    onFailure?: () => Promise<void>,
  ): Promise<'totp' | 'backup'> {
    const keys = await this.startCodeAttempt(accountId, clientIp);
    const verdict = await this.twoFactor.verifyCode(accountId, code);

    if (verdict === 'invalid' || verdict === 'malformed') {
      throw await this.refuseCode(keys, accountId, verdict, onFailure);
    }

    await this.acceptCode(keys);

    return verdict;
  }

  /** Ouvre un essai de code, ou refuse quand la limite est atteinte. */
  private async startCodeAttempt(accountId: string, clientIp: string): Promise<AttemptKeys> {
    const keys = this.attempts.keysFor(accountId, clientIp);

    if (await this.attempts.isBlocked(keys, 'code')) {
      await this.attempts.record(keys, 'blocked', 'code');
      this.logger.warn({ accountId }, 'code bloqué par la limitation');

      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_CODES);
    }

    return keys;
  }

  /**
   * Compte l'échec et rend l'exception à lever.
   *
   * Elle est rendue et non levée ici : `throw await ...` chez l'appelant est ce
   * qui fait voir au compilateur que la suite n'est pas atteinte.
   */
  private async refuseCode(
    keys: AttemptKeys,
    accountId: string,
    verdict: 'invalid' | 'malformed',
    onFailure?: () => Promise<void>,
  ): Promise<ProblemException> {
    await this.attempts.record(keys, 'failed', 'code');
    await onFailure?.();
    // Jamais le code soumis, pas plus qu'un mot de passe.
    this.logger.info({ accountId }, 'code refusé');

    return new ProblemException(
      HttpStatus.UNAUTHORIZED,
      verdict === 'malformed' ? MALFORMED_BACKUP_CODE : INVALID_CODE,
    );
  }

  private async acceptCode(keys: AttemptKeys): Promise<void> {
    await this.attempts.record(keys, 'succeeded', 'code');
  }

  /** Le second facteur ne concerne que l'administrateur dans ce lot. */
  private requireAdmin(account: AccountRecord): void {
    if (account.role !== 'admin') {
      throw new ProblemException(HttpStatus.FORBIDDEN, ADMIN_ONLY);
    }
  }

  /**
   * Redemande le mot de passe du compte connecté, et compte l'essai.
   *
   * La limitation est le point que la relecture sécurité a relevé : sans elle,
   * une session volée permettait de deviner le mot de passe sans borne, et
   * chaque essai réservait 64 Mio d'Argon2. C'est pourtant ce mot de passe qui
   * empêche cette même session d'inscrire l'application de l'attaquant.
   *
   * Un motif à part, `reauth`, et non celui de la connexion : les deux
   * partagent l'adresse IP, et compter ensemble permettrait à un porteur de
   * session d'épuiser le compteur de `/auth/login` et de verrouiller le vrai
   * propriétaire dehors.
   */
  private async confirmPassword(
    account: AccountRecord,
    password: string,
    clientIp: string,
  ): Promise<void> {
    const keys = this.attempts.keysFor(account.id, clientIp);

    if (await this.attempts.isBlocked(keys, 'reauth')) {
      await this.attempts.record(keys, 'blocked', 'reauth');
      this.logger.warn({ accountId: account.id }, 'réauthentification bloquée par la limitation');

      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, TOO_MANY_PASSWORDS);
    }

    if (!(await verifyPassword(account.passwordHash, password))) {
      await this.attempts.record(keys, 'failed', 'reauth');
      this.logger.info({ accountId: account.id }, 'mot de passe refusé à la réauthentification');

      throw new ProblemException(HttpStatus.UNAUTHORIZED, WRONG_PASSWORD);
    }

    await this.attempts.record(keys, 'succeeded', 'reauth');
  }

  private async openSession(
    accountId: string,
    remember: boolean,
    adminUnlockedAt?: Date,
  ): Promise<string[]> {
    const opened = await this.sessions.open(accountId, adminUnlockedAt);
    const cookies = [sessionCookie(opened.token), csrfCookie(opened.csrfSecret)];

    if (remember) {
      cookies.push(rememberCookie(await this.remember.issue(accountId)));
    }

    return cookies;
  }
}
