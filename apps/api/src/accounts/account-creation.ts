import { eq } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { account, household } from '../db/schema.js';
import { hashPassword } from '../security/passwords.js';

/*
  La création d'un compte et de son foyer, en un seul endroit.

  Deux chemins y mènent : la commande `admin:create`, pour le premier
  administrateur, et l'acceptation d'une invitation. Qu'ils partagent ce code
  est ce qui garantit qu'un compte créé par l'un vaut un compte créé par
  l'autre : même hachage, même transaction, même normalisation.
*/

/**
 * Le nom du foyer quand personne ne l'a choisi.
 *
 * L'invité ne le saisit pas : rien ne le lit encore, et le demander sur le
 * premier écran d'une personne reviendrait à réclamer une donnée inutilisée au
 * moment où l'abandon coûte le plus cher. Le renommage appartient au profil du
 * foyer (issue #14), qui demandera de toute façon sa taille et ses contraintes.
 *
 * Un nom dérivé de l'adresse a été écarté : ce serait recopier une donnée
 * personnelle dans une seconde colonne.
 */
export const DEFAULT_HOUSEHOLD_NAME = 'Mon foyer';

export interface NewAccount {
  /** Adresse déjà normalisée par le schéma partagé. */
  email: string;
  password: string;
  role: 'user' | 'admin';
  householdName: string;
}

export interface CreatedAccount {
  householdId: string;
  accountId: string;
}

/** Cette adresse a-t-elle déjà un compte ? */
export async function emailIsTaken(database: Database, email: string): Promise<boolean> {
  const existing = await database
    .select({ id: account.id })
    .from(account)
    .where(eq(account.email, email))
    .limit(1);

  return existing.length > 0;
}

/**
 * Crée un foyer et son compte, dans la même transaction.
 *
 * Dans la même, parce qu'un foyer sans compte n'aurait aucun moyen d'être
 * retrouvé, et qu'il faudrait aller le supprimer à la main.
 *
 * Le hachage est fait **avant** : Argon2 prend une centaine de millisecondes,
 * qui n'ont rien à faire dans une transaction ouverte.
 */
export async function createAccountWithHousehold(
  database: Database,
  input: NewAccount,
): Promise<CreatedAccount> {
  const passwordHash = await hashPassword(input.password);

  return database.transaction(async (transaction) => {
    const [createdHousehold] = await transaction
      .insert(household)
      .values({ name: input.householdName })
      .returning({ id: household.id });

    if (createdHousehold === undefined) {
      throw new Error("la création du foyer n'a rien renvoyé");
    }

    const [createdAccount] = await transaction
      .insert(account)
      .values({
        householdId: createdHousehold.id,
        email: input.email,
        passwordHash,
        role: input.role,
      })
      .returning({ id: account.id });

    if (createdAccount === undefined) {
      throw new Error("la création du compte n'a rien renvoyé");
    }

    return { householdId: createdHousehold.id, accountId: createdAccount.id };
  });
}
