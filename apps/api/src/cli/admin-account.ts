import { emailSchema, MIN_PASSWORD_LENGTH } from '@mijote/shared';

import {
  type CreatedAccount,
  createAccountWithHousehold,
  emailIsTaken,
} from '../accounts/account-creation.js';
import type { Database } from '../db/client.js';

/*
  Ce que la commande de création d'administrateur fait vraiment, séparé de la
  saisie : c'est la part qui se teste contre une vraie base.

  L'écriture elle-même vit dans accounts/account-creation.ts, partagée avec
  l'acceptation d'une invitation : un compte créé par la commande vaut ainsi un
  compte créé par le lien, au hachage et à la transaction près.
*/

export interface AdminInput {
  householdName: string;
  email: string;
  password: string;
}

export type CreatedAdmin = CreatedAccount;

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

  if (await withSafeFailure(() => emailIsTaken(database, email.data))) {
    throw new Error('un compte existe déjà pour cette adresse');
  }

  return withSafeFailure(() =>
    createAccountWithHousehold(database, {
      email: email.data,
      password: input.password,
      role: 'admin',
      householdName,
    }),
  );
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

  /*
    Sans code de PostgreSQL, l'échec ne vient pas forcément de la base : la
    création de compte hache aussi le mot de passe, et annoncer « l'écriture en
    base a échoué » enverrait alors chercher au mauvais endroit. Le message
    reste donc neutre, et il ne recopie toujours rien de ce qu'on a passé.
  */
  if (code === undefined) {
    return new Error("la création du compte a échoué, voir les journaux de l'API");
  }

  return new Error(`l'écriture en base a échoué (code ${code}), voir les journaux de PostgreSQL`);
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
