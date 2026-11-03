import { emailSchema, MIN_PASSWORD_LENGTH } from '@mijote/shared';
import { eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { account, household } from '../db/schema.js';
import { hashPassword } from '../security/passwords.js';

/*
  Ce que la commande de création d'administrateur fait vraiment, séparé de la
  saisie : c'est la part qui se teste contre une vraie base.
*/

export interface AdminInput {
  householdName: string;
  email: string;
  password: string;
}

export interface CreatedAdmin {
  householdId: string;
  accountId: string;
}

/**
 * Crée un foyer et son premier compte administrateur.
 *
 * Les deux écritures sont dans la même transaction : un foyer sans compte
 * n'aurait aucun moyen d'être retrouvé, et il faudrait aller le supprimer à la
 * main.
 */
export async function createAdminAccount(
  database: Database,
  input: AdminInput,
): Promise<CreatedAdmin> {
  const householdName = input.householdName.trim();

  if (householdName === '') {
    throw new Error('le nom du foyer ne peut pas être vide');
  }

  const email = emailSchema.safeParse(input.email);

  if (!email.success) {
    throw new Error("cette adresse e-mail n'est pas valide");
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `le mot de passe doit faire au moins ${String(MIN_PASSWORD_LENGTH)} caractères`,
    );
  }

  const existing = await database
    .select({ id: account.id })
    .from(account)
    .where(eq(account.email, email.data))
    .limit(1);

  if (existing.length > 0) {
    throw new Error('un compte existe déjà pour cette adresse');
  }

  // Hachée avant la transaction : Argon2 prend une centaine de millisecondes,
  // qui n'ont rien à faire dans une transaction ouverte.
  const passwordHash = await hashPassword(input.password);

  return database.transaction(async (transaction) => {
    const [createdHousehold] = await transaction
      .insert(household)
      .values({ name: householdName })
      .returning({ id: household.id });

    if (createdHousehold === undefined) {
      throw new Error("la création du foyer n'a rien renvoyé");
    }

    const [createdAccount] = await transaction
      .insert(account)
      .values({
        householdId: createdHousehold.id,
        email: email.data,
        passwordHash,
        role: 'admin',
      })
      .returning({ id: account.id });

    if (createdAccount === undefined) {
      throw new Error("la création du compte n'a rien renvoyé");
    }

    return { householdId: createdHousehold.id, accountId: createdAccount.id };
  });
}
