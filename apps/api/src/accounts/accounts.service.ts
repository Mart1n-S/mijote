import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';

import type { Database, Transaction } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';
import { account } from '../db/schema.js';

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

  /**
   * Ce que l'export emporte du compte : son identité, jamais son empreinte.
   *
   * La requête vit ici parce que la table est la sienne : le module des droits
   * RGPD n'a aucune requête à lui (`api.md`, ADR 0017).
   */
  async detailsOf(
    accountId: string,
  ): Promise<{ id: string; email: string; role: 'user' | 'admin'; createdAt: Date } | undefined> {
    const [row] = await this.database
      .select({
        id: account.id,
        email: account.email,
        role: account.role,
        createdAt: account.createdAt,
      })
      .from(account)
      .where(eq(account.id, accountId))
      .limit(1);

    return row;
  }

  /**
   * Combien de comptes portent le rôle administrateur.
   *
   * Sans verrou, à la différence de la version transactionnelle en dessous :
   * cette lecture-ci ne décide de rien, elle ne sert qu'à désactiver un bouton.
   * La décision, elle, se prend derrière le verrou (ADR 0017).
   */
  async countAdmins(): Promise<number> {
    // `count` et non la longueur des lignes : il n'y a rien à rapporter, et
    // seul le nombre est demandé.
    const [row] = await this.database
      .select({ total: count() })
      .from(account)
      .where(eq(account.role, 'admin'));

    return row?.total ?? 0;
  }

  /**
   * Compte les administrateurs, et les verrouille le temps de la transaction.
   *
   * `for update` n'est pas une précaution de style : sans lui, deux derniers
   * administrateurs qui se suppriment en même temps verraient chacun deux
   * comptes, et l'application se retrouverait sans administrateur. Le second
   * attend ici, puis voit un seul compte et se fait refuser (ADR 0017).
   */
  async lockAdminsWithin(transaction: Transaction): Promise<number> {
    const rows = await transaction
      .select({ id: account.id })
      .from(account)
      .where(eq(account.role, 'admin'))
      .for('update');

    return rows.length;
  }

  async create(input: NewAccount): Promise<CreatedAccount> {
    return createAccountWithHousehold(this.database, input);
  }
}
