import { randomUUID } from 'node:crypto';
import { DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, type Database } from '../db/client.js';
import { account, household } from '../db/schema.js';
import { loadEnvFile } from '../env.js';
import { verifyPassword } from '../security/passwords.js';

import { createAdminAccount, databaseFailure } from './admin-account.js';

/*
  La commande de création d'administrateur, contre une vraie base.

  Même règle que auth.integration.spec.ts : sauté quand PostgreSQL n'est pas
  joignable, jamais sauté en CI.
*/

loadEnvFile();

const DATABASE_URL = process.env['DATABASE_URL'];
const PASSWORD = 'un mot de passe assez long';
const EMAIL = `admin-${randomUUID()}@exemple.test`;

async function probeDatabase(url: string): Promise<boolean> {
  const probe = createDatabase(url);

  try {
    await probe.execute(sql`select 1 from ${account} limit 1`);

    return true;
  } catch {
    return false;
  } finally {
    await probe.$client.end();
  }
}

const reachable = DATABASE_URL === undefined ? false : await probeDatabase(DATABASE_URL);

if (!reachable && process.env['CI'] === 'true') {
  throw new Error(
    'PostgreSQL est injoignable, ou les migrations ne sont pas passées, alors que CI est posée : ce test ne doit pas se sauter en CI.',
  );
}

describe('databaseFailure', () => {
  it('ne recopie ni les paramètres de la requête, ni le mot de passe haché', () => {
    /*
      La vraie classe de drizzle-orm : c'est elle qui place la requête et ses
      paramètres dans son message. Cette commande passe à l'INSERT une adresse
      e-mail et une empreinte Argon2, et sa sortie se retrouve dans un
      historique de terminal.
    */
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });
    const failure = new DrizzleQueryError(
      'insert into "account" ("email", "password_hash") values ($1, $2)',
      ['victime@exemple.fr', '$argon2id$v=19$m=65536,t=3,p=1$sel$empreinte'],
      cause,
    );

    const safe = databaseFailure(failure);

    expect(safe.message).not.toContain('victime@exemple.fr');
    expect(safe.message).not.toContain('argon2');
    expect(safe.message).not.toContain('insert into');
    // Le code de PostgreSQL reste, lui : il dit quoi corriger.
    expect(safe.message).toContain('23505');
  });

  it("reste neutre quand l'erreur ne porte pas de code", () => {
    /*
      Sans code de PostgreSQL, l'échec ne vient pas forcément de la base : la
      création de compte hache aussi le mot de passe. Annoncer « l'écriture en
      base a échoué » enverrait alors chercher au mauvais endroit.
    */
    expect(databaseFailure(new Error('réseau coupé')).message).toBe(
      "la création du compte a échoué, voir les journaux de l'API",
    );
    expect(databaseFailure(new Error('réseau coupé')).message).not.toContain('écriture en base');
    expect(databaseFailure('pas une erreur').message).toContain('a échoué');
  });
});

describe.skipIf(!reachable)('createAdminAccount', () => {
  let database: Database;
  const created: string[] = [];

  beforeAll(() => {
    database = createDatabase(DATABASE_URL ?? '');
  });

  afterAll(async () => {
    for (const id of created) {
      // Le foyer emporte son compte en cascade.
      await database.delete(household).where(eq(household.id, id));
    }

    await database.$client.end();
  });

  it('crée un foyer et son administrateur, mot de passe haché', async () => {
    const admin = await createAdminAccount(database, {
      householdName: '  Foyer Simon  ',
      email: EMAIL.toUpperCase(),
      password: PASSWORD,
    });

    created.push(admin.householdId);

    const [row] = await database.select().from(account).where(eq(account.id, admin.accountId));

    expect(row?.role).toBe('admin');
    // L'adresse est normalisée par le schéma partagé, le nom du foyer est élagué.
    expect(row?.email).toBe(EMAIL.toLowerCase());
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(row?.passwordHash ?? '', PASSWORD)).toBe(true);

    const [foyer] = await database
      .select()
      .from(household)
      .where(eq(household.id, admin.householdId));

    expect(foyer?.name).toBe('Foyer Simon');
  });

  it('refuse une seconde fois la même adresse', async () => {
    await expect(
      createAdminAccount(database, {
        householdName: 'Autre foyer',
        email: EMAIL,
        password: PASSWORD,
      }),
    ).rejects.toThrow(/existe déjà/);

    // Et aucun foyer orphelin n'est resté derrière.
    const foyers = await database
      .select({ id: household.id })
      .from(household)
      .where(eq(household.name, 'Autre foyer'));

    expect(foyers).toEqual([]);
  });

  it('refuse un nom vide, une adresse invalide et un mot de passe trop court', async () => {
    const valid = { householdName: 'Foyer', email: `x-${randomUUID()}@exemple.test` };

    await expect(
      createAdminAccount(database, { ...valid, householdName: '   ', password: PASSWORD }),
    ).rejects.toThrow(/nom du foyer/);
    await expect(
      createAdminAccount(database, { ...valid, email: 'pas une adresse', password: PASSWORD }),
    ).rejects.toThrow(/adresse e-mail/);
    await expect(
      createAdminAccount(database, { ...valid, password: 'trop court' }),
    ).rejects.toThrow(/12 caractères/);
  });
});
