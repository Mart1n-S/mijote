import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../db/database.module.js';
import { MailModule } from '../mail/mail.module.js';

import { InvitationRepository } from './invitation.repository.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

@Module({
  imports: [DatabaseModule, MailModule, AccountsModule, AuthModule],
  controllers: [InvitationsController],
  providers: [InvitationRepository, InvitationsService],
})
export class InvitationsModule {}
