import { ACCOUNT_EXPORT_FORMAT, type AccountExport, type HouseholdProfile } from '@mijote/shared';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { AccountsService } from '../accounts/accounts.service.js';
import { AuthService, type SecurityExport } from '../auth/auth.service.js';
import type { Authenticated } from '../auth/session.service.js';
import { HouseholdsService } from '../households/households.service.js';
import { InvitationsService } from '../invitations/invitations.service.js';

/*
  Les deux droits du RGPD : récupérer ses données, et les faire supprimer.

  Ce module n'a **aucune requête à lui**. Il demande à chaque module ce que ce
  module détient, parce qu'un module n'accède pas aux tables d'un autre
  (`api.md`). C'est aussi ce qui fait qu'il dépend de tout le reste et que rien
  ne dépend de lui : il n'y a donc pas de cycle (ADR 0017).
*/

/** Ce que l'export lit du compte, et rien de plus. */
export interface AccountGateway {
  detailsOf(
    accountId: string,
  ): Promise<{ id: string; email: string; role: 'user' | 'admin'; createdAt: Date } | undefined>;
}

/** Ce qu'il lit de la sécurité du compte. */
export interface SecurityGateway {
  exportSecurity(accountId: string): Promise<SecurityExport>;
}

/** Ce qu'il lit du foyer. */
export interface HouseholdGateway {
  exportable(householdId: string): Promise<{ createdAt: string; profile: HouseholdProfile }>;
}

/** Ce qu'il lit des invitations. */
export interface InvitationGateway {
  exportableFor(
    email: string,
  ): Promise<{ createdAt: string; usedAt: string | null; role: 'user' | 'admin' } | null>;
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
    @Inject(AuthService) private readonly security: SecurityGateway,
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
}
