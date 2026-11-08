import { Module } from '@nestjs/common';

import { DatabaseModule } from '../db/database.module.js';

import { AccountsService } from './accounts.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
