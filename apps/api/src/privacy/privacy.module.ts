import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { HouseholdsModule } from '../households/households.module.js';
import { InvitationsModule } from '../invitations/invitations.module.js';

import { PrivacyController } from './privacy.controller.js';
import { PrivacyService } from './privacy.service.js';

/**
 * L'export et la suppression de son compte.
 *
 * Ce module dépend de tous ceux qui détiennent des données personnelles, et
 * **rien ne dépend de lui** : c'est la forme qui évite un cycle, le module des
 * invitations dépendant déjà de celui des comptes. Mettre ces routes dans
 * `accounts/` aurait fermé la boucle (ADR 0017).
 */
@Module({
  imports: [AccountsModule, AuthModule, HouseholdsModule, InvitationsModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
