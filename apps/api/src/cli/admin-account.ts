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

  const existing = await withSafeFailure(() =>
    database.select({ id: account.id }).from(account).where(eq(account.email, email.data)).limit(1),
  );

  if (existing.length > 0) {
    throw new Error('un compte existe déjà pour cette adresse');
  }

  // Hachée avant la transaction : Argon2 prend une centaine de millisecondes,
  // qui n'ont rien à faire dans une transaction ouverte.
  const passwordHash = await hashPassword(input.password);

  return withSafeFailure(() => createRows(database, email.data, householdName, passwordHash));
}

/**
 * Ce qu'on peut dire d'une erreur de base sans recopier ce qu'on lui a passé.
 *
 * Drizzle place la requête **et ses paramètres** dans le message de ses
 * erreurs, et cette commande reçoit une adresse e-mail et une empreinte de mot
 * de passe. Sa sortie se retrouvant dans un historique de terminal, elle ne
 * garde que le code de PostgreSQL, qui dit quoi corriger sans rien recopier.
 */
export function databaseFailure(error: unknown): Error {
  const code = readPostgresCode(error);

  return new Error(
    `l'écriture en base a échoué${code === undefined ? '' : ` (code ${code})`}, voir les journaux de PostgreSQL`,
  );
}

function readPostgresCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  // Sur une erreur de requête de Drizzle, le code vit sur la cause.
  for (const candidate of [error, error.cause]) {
    if (candidate instanceof Error && 'code' in candidate && typeof candidate.code === 'string') {
      return candidate.code;
    }
  }

  return undefined;
}

async function withSafeFailure<Result>(run: () => Promise<Result>): Promise<Result> {
  try {
    return await run();
  } catch (error) {
    throw databaseFailure(error);
  }
}

function createRows(
  database: Database,
  email: string,
  householdName: string,
  passwordHash: string,
): Promise<CreatedAdmin> {
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
        email,
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
