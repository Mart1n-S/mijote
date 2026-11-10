import { ACCOUNT_EXPORT_FORMAT, type AccountExport, type HouseholdProfile } from '@mijote/shared';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AccountsService } from '../accounts/accounts.service.js';
import { AttemptsService } from '../auth/attempts.service.js';
import { clearedCookies } from '../auth/auth.cookies.js';
import { AuthService, type SecurityExport } from '../auth/auth.service.js';
import type { Authenticated } from '../auth/session.service.js';
import type { Database, Transaction } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';
import { ProblemException } from '../errors/problem.exception.js';
import { HouseholdsService } from '../households/households.service.js';
import { InvitationsService } from '../invitations/invitations.service.js';

/*
  Les deux droits du RGPD : récupérer ses données, et les faire supprimer.

  Ce module n'a **aucune requête à lui**, et c'est voulu : il demande à chaque
  module ce que ce module détient, parce qu'un module n'accède pas aux tables
  d'un autre (`api.md`). Il ouvre en revanche la **transaction** de la
  suppression, et la passe à ceux qu'il appelle : il n'y en a qu'une à valider. C'est aussi ce qui fait qu'il dépend de tout le reste et que rien
  ne dépend de lui : il n'y a donc pas de cycle (ADR 0017).
*/

/**
 * Le refus du dernier administrateur.
 *
 * Le message nomme le seul chemin qui existe avant l'issue #48 : aucun écran ne
 * change le rôle d'un compte existant, et c'est l'invitation qui porte le rôle
 * (ADR 0013, ADR 0017).
 */
const LAST_ADMIN =
  'Vous êtes le seul administrateur. Invitez un compte avec le rôle administrateur, puis réessayez.';

/** Ce que l'export et la suppression lisent du compte. */
export interface AccountGateway {
  detailsOf(
    accountId: string,
  ): Promise<{ id: string; email: string; role: 'user' | 'admin'; createdAt: Date } | undefined>;
  lockAdminsWithin(transaction: Transaction): Promise<number>;
}

/** Ce qu'il lit et supprime du foyer. */
export interface HouseholdGateway {
  exportable(householdId: string): Promise<{ createdAt: string; profile: HouseholdProfile }>;
  deleteWithin(transaction: Transaction, householdId: string): Promise<number>;
}

/** Ce qu'il lit et supprime des invitations. */
export interface InvitationGateway {
  exportableFor(
    email: string,
  ): Promise<{ createdAt: string; usedAt: string | null; role: 'user' | 'admin' } | null>;
  deleteForEmailWithin(transaction: Transaction, email: string): Promise<number>;
}

/** Ce qu'il demande a la limitation. */
export interface AttemptsGateway {
  forgetWithin(
    transaction: Transaction,
    subject: { email: string; accountId: string },
  ): Promise<number>;
}

/** Ce qu'il demande a la reauthentification, et a la securite du compte. */
export interface ConfirmationGateway {
  requirePassword(authenticated: Authenticated, password: string, clientIp: string): Promise<void>;
  requireSecondFactor(
    authenticated: Authenticated,
    code: string | undefined,
    clientIp: string,
  ): Promise<void>;
  exportSecurity(accountId: string): Promise<SecurityExport>;
}

/** Ce que ce service journalise, et rien de plus. */
export interface PrivacyLog {
  setContext(context: string): void;
  info(object: object, message: string): void;
}

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountGateway,
    @Inject(AttemptsService) private readonly attempts: AttemptsGateway,
    @Inject(DATABASE) private readonly database: Database,
    @Inject(AuthService) private readonly security: ConfirmationGateway,
    @Inject(HouseholdsService) private readonly households: HouseholdGateway,
    @Inject(InvitationsService) private readonly invitations: InvitationGateway,
    @Inject(PinoLogger) private readonly logger: PrivacyLog,
  ) {
    this.logger.setContext(PrivacyService.name);
  }

  /**
   * Tout ce que l'application sait de ce compte et de son foyer.
   *
   * La règle, et elle n'a pas d'exception : **rien de ce qui sert à
   * s'authentifier ne sort**, même sous forme d'empreinte, et rien des données
   * d'un tiers. Ce qui est exclu est énuméré dans l'ADR 0017 et mesuré par un
   * test qui parcourt le fichier produit.
   */
  async export(authenticated: Authenticated): Promise<AccountExport> {
    const { account } = authenticated;
    const details = await this.accounts.detailsOf(account.id);

    if (details === undefined) {
      // La session existe, donc son compte aussi : son absence est un défaut de
      // données, pas un refus d'accès.
      throw new Error('le compte de la session connectée est introuvable');
    }

    const [security, household, invitation] = await Promise.all([
      this.security.exportSecurity(account.id),
      this.households.exportable(account.householdId),
      this.invitations.exportableFor(details.email),
    ]);

    // L'identifiant du compte, et rien du contenu : un export journalisé en
    // détail ferait du journal une seconde copie du fichier (ADR 0017).
    this.logger.info({ accountId: account.id }, 'export demandé');

    return {
      format: ACCOUNT_EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      account: {
        id: details.id,
        email: details.email,
        role: details.role,
        createdAt: details.createdAt.toISOString(),
      },
      twoFactor: security.twoFactor,
      household: {
        id: account.householdId,
        createdAt: household.createdAt,
        profile: household.profile,
      },
      devices: security.devices,
      invitation,
    };
  }

  /**
   * Supprime le compte, son foyer et ses traces.
   *
   * Trois choses sont exigées avant d'arriver ici : le mot de passe, le code du
   * second facteur quand il est actif, et une confirmation explicite que le
   * schéma impose. Ce sont celles qu'une session volée n'a pas (ADR 0017).
   *
   * **Une seule transaction**, et chaque module y apporte ses propres
   * requêtes : les invitations adressées à cette adresse, les tentatives
   * comptées sur ce compte, puis le foyer, dont la cascade emporte le reste.
   *
   * Rend les cookies à effacer : la session vient d'être supprimée côté
   * serveur, et le navigateur n'a aucune raison de garder un jeton qui ne
   * désigne plus rien.
   */
  async delete(
    authenticated: Authenticated,
    input: { password: string; code?: string | undefined },
    clientIp: string,
  ): Promise<{ cookies: string[] }> {
    const { account } = authenticated;

    await this.security.requirePassword(authenticated, input.password, clientIp);
    await this.security.requireSecondFactor(authenticated, input.code, clientIp);

    const details = await this.accounts.detailsOf(account.id);

    if (details === undefined) {
      throw new Error('le compte de la session connectée est introuvable');
    }

    const removed = await this.database.transaction(async (transaction) => {
      /*
        Le refus du dernier administrateur est **dans** la transaction, derrière
        le verrou : lever ici annule tout ce qui précède, et deux suppressions
        simultanées ne peuvent pas laisser l'application sans administrateur.
      */
      if (account.role === 'admin' && (await this.accounts.lockAdminsWithin(transaction)) <= 1) {
        throw new ProblemException(HttpStatus.CONFLICT, LAST_ADMIN);
      }

      const invitations = await this.invitations.deleteForEmailWithin(transaction, details.email);
      const attempts = await this.attempts.forgetWithin(transaction, {
        email: details.email,
        accountId: account.id,
      });
      const households = await this.households.deleteWithin(transaction, account.householdId);

      return { invitations, attempts, households };
    });

    /*
      Des identifiants et des nombres, jamais l'adresse ni le nom du foyer. La
      ligne survit au compte, le journal d'audit conservant un an les actions
      sensibles : elle ne porte qu'un identifiant qui ne désigne plus rien, ce
      qui est exactement ce qu'une trace doit être après un effacement.
    */
    this.logger.info(
      {
        accountId: account.id,
        householdId: account.householdId,
        invitations: removed.invitations,
        attempts: removed.attempts,
        households: removed.households,
      },
      'compte supprimé',
    );

    return { cookies: clearedCookies() };
  }
}
