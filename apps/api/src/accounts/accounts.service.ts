import { Inject, Injectable } from '@nestjs/common';

import type { Database } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';

import {
  type CreatedAccount,
  createAccountWithHousehold,
  emailIsTaken,
  type NewAccount,
} from './account-creation.js';

/*
  Le seul service qui écrit dans la table des comptes.

  Les invitations en ont besoin pour créer le compte d'un invité, et un module
  n'accède pas aux tables d'un autre : il passe par son service (api.md). La
  commande `admin:create`, elle, tourne hors de NestJS et appelle directement
  les fonctions de account-creation.ts, que ce service enveloppe.
*/
@Injectable()
export class AccountsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async isEmailTaken(email: string): Promise<boolean> {
    return emailIsTaken(this.database, email);
  }

  async create(input: NewAccount): Promise<CreatedAccount> {
    return createAccountWithHousehold(this.database, input);
  }
}
