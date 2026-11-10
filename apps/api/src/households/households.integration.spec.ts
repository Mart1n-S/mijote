import {
  CSRF_COOKIE,
  CSRF_HEADER,
  householdProfileSchema,
  problemDetailsSchema,
} from '@mijote/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { createDatabase, type Database } from '../db/client.js';
import { account, household, loginAttempt } from '../db/schema.js';
import { loadEnvFile } from '../env.js';
import { hashPassword } from '../security/passwords.js';
import { fingerprint, readPepper } from '../security/pepper.js';
import { resolveTrustProxy } from '../security/trust-proxy.js';

/*
  Le profil du foyer contre une vraie base.

  C'est le seul fichier qui mesure **l'isolement des foyers** : deux foyers,
  deux comptes, deux sessions, et la vérification qu'aucune des deux ne peut
  lire ni modifier le foyer de l'autre, y compris en envoyant son identifiant
  dans le corps (ADR 0015).

  C'est aussi le seul qui mesure le SQL du profil : les tableaux
  d'énumérations, et le contrat du PATCH partiel (absent, nul, vide) sur de
  vraies colonnes.

  Hors CI, il se saute quand PostgreSQL n'est pas joignable, pour qu'un
  `pnpm test` sans `docker compose up` reste vert. **En CI, il ne se saute
  jamais.**
*/

loadEnvFile();

const DATABASE_URL = process.env['DATABASE_URL'];
const PASSWORD = 'un mot de passe assez long';

const MINE_EMAIL = `foyer-${randomUUID()}@exemple.test`;
const OTHER_EMAIL = `voisin-${randomUUID()}@exemple.test`;

/** Une IP par compte : la limitation compte par IP, et ne doit pas les mêler. */
const IPS = { mine: '203.0.113.40', other: '203.0.113.41' };

async function probeDatabase(url: string): Promise<boolean> {
  const probe = createDatabase(url);

  try {
    // La colonne de la migration 0007 : une base non migrée vaut une base
    // absente.
    await probe.execute(sql`select "variety_balance" from ${household} limit 1`);

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
    "PostgreSQL est injoignable, ou les migrations ne sont pas passées, alors que CI est posée : le service déclaré dans .github/workflows/ci.yml n'a pas démarré, et ce test ne doit pas se sauter en CI.",
  );
}

let database: Database;
let app: NestExpressApplication;
let baseUrl: string;

/** Les deux foyers, chacun avec son compte et sa session. */
interface Tenant {
  householdId: string;
  cookie: string;
  csrf: string;
  ip: string;
}

let mine: Tenant;
let other: Tenant;

function cookieValue(response: Response, name: string): string | undefined {
  for (const header of response.headers.getSetCookie()) {
    if (header.startsWith(`${name}=`)) {
      const value = header.slice(name.length + 1).split(';')[0];

      return value === '' ? undefined : value;
    }
  }

  return undefined;
}

/** Monte un foyer, son compte, et ouvre sa session. */
async function createTenant(name: string, email: string, ip: string): Promise<Tenant> {
  const [created] = await database
    .insert(household)
    .values({ name })
    .returning({ id: household.id });

  const householdId = created?.id ?? '';

  await database
    .insert(account)
    .values({ householdId, email, passwordHash: await hashPassword(PASSWORD) });

  const opened = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl, 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: PASSWORD }),
  });

  if (opened.status !== 200) {
    throw new Error(`la session de ${name} ne s'est pas ouverte : ${String(opened.status)}`);
  }

  const csrf = cookieValue(opened, CSRF_COOKIE) ?? '';

  return {
    householdId,
    csrf,
    ip,
    cookie: `mijote_session=${cookieValue(opened, 'mijote_session') ?? ''}; ${CSRF_COOKIE}=${csrf}`,
  };
}

async function getProfile(tenant: Tenant): Promise<Response> {
  return fetch(`${baseUrl}/household/profile`, {
    headers: { origin: baseUrl, cookie: tenant.cookie, 'x-forwarded-for': tenant.ip },
  });
}

async function patchProfile(tenant: Tenant, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/household/profile`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      cookie: tenant.cookie,
      [CSRF_HEADER]: tenant.csrf,
      'x-forwarded-for': tenant.ip,
    },
    body: JSON.stringify(body),
  });
}

/** Le profil lu, validé par le schéma partagé. */
async function profileOf(tenant: Tenant): Promise<ReturnType<typeof householdProfileSchema.parse>> {
  const response = await getProfile(tenant);

  expect(response.status).toBe(200);

  return householdProfileSchema.parse(await response.json());
}

describe.skipIf(!reachable)('le profil du foyer, contre une vraie base', () => {
  beforeAll(async () => {
    process.env['LOG_LEVEL'] = 'silent';
    process.env['SMTP_HOST'] ??= '127.0.0.1';
    process.env['SMTP_PORT'] ??= '1025';
    process.env['MAIL_FROM'] ??= 'Mijote <no-reply@mijote.local>';
    process.env['SECURITY_PEPPER'] ??= Buffer.alloc(32).toString('base64');
    process.env['SECURITY_TOTP_KEY'] ??= Buffer.alloc(32).toString('base64');
    process.env['APP_BASE_URL'] ??= 'https://mijote.local';

    database = createDatabase(DATABASE_URL ?? '');

    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    app.set('trust proxy', resolveTrustProxy(process.env));

    await app.listen(0);

    baseUrl = await app.getUrl();

    mine = await createTenant('Chez moi', MINE_EMAIL, IPS.mine);
    other = await createTenant('Chez le voisin', OTHER_EMAIL, IPS.other);
  });

  afterAll(async () => {
    for (const tenant of [mine, other]) {
      await database.delete(household).where(eq(household.id, tenant.householdId));
    }

    const pepper = readPepper(process.env);

    for (const value of [MINE_EMAIL, OTHER_EMAIL, ...Object.values(IPS)]) {
      const print = fingerprint(pepper, value);

      await database.delete(loginAttempt).where(eq(loginAttempt.emailFingerprint, print));
      await database.delete(loginAttempt).where(eq(loginAttempt.ipFingerprint, print));
    }

    await app.close();
    await database.$client.end();
  });

  describe("l'isolement des foyers", () => {
    it('ne rend à chaque session que son propre foyer', async () => {
      expect((await profileOf(mine)).name).toBe('Chez moi');
      expect((await profileOf(other)).name).toBe('Chez le voisin');
    });

    it("ne laisse pas une écriture toucher le foyer d'à côté", async () => {
      expect((await patchProfile(mine, { peopleCount: 4, allergens: ['milk'] })).status).toBe(200);

      const neighbour = await profileOf(other);

      expect(neighbour.peopleCount).toBeNull();
      expect(neighbour.allergens).toEqual([]);
    });

    it('ignore un identifiant de foyer envoyé dans le corps', async () => {
      /*
        Le test qui tombe en premier si quelqu'un déclare un jour `householdId`
        dans le schéma pour « laisser le client préciser » : la clé est retirée
        en silence, et seuls les champs légitimes de l'auteur sont écrits
        (ADR 0015).
      */
      const response = await patchProfile(mine, {
        householdId: other.householdId,
        maxMealMinutes: 30,
      });

      expect(response.status).toBe(200);

      const neighbour = await profileOf(other);

      expect(neighbour.maxMealMinutes).toBeNull();
      expect((await profileOf(mine)).maxMealMinutes).toBe(30);
    });

    it('refuse les trois routes sans session', async () => {
      for (const [method, path] of [
        ['GET', '/household/profile'],
        ['GET', '/household/onboarding'],
        ['PATCH', '/household/profile'],
      ] as const) {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { 'content-type': 'application/json', origin: baseUrl },
          ...(method === 'PATCH' ? { body: '{}' } : {}),
        });

        expect(response.status, `${method} ${path}`).toBe(401);
      }
    });

    it('exige le jeton CSRF sur la modification', async () => {
      // Une session existe, donc elle porte un secret : cette route n'a aucune
      // raison d'être exemptée (ADR 0015).
      const response = await fetch(`${baseUrl}/household/profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', origin: baseUrl, cookie: mine.cookie },
        body: JSON.stringify({ peopleCount: 2 }),
      });

      expect(response.status).toBe(403);
    });
  });

  describe('le contrat du PATCH, en vrai SQL', () => {
    it('garde un champ absent, efface un champ nul', async () => {
      await patchProfile(mine, { peopleCount: 3, monthlyBudgetCents: 15_000 });
      await patchProfile(mine, { peopleCount: 5 });

      const kept = await profileOf(mine);

      expect(kept.peopleCount).toBe(5);
      expect(kept.monthlyBudgetCents).toBe(15_000);

      await patchProfile(mine, { monthlyBudgetCents: null });

      expect((await profileOf(mine)).monthlyBudgetCents).toBeNull();
    });

    it('écrit, garde et efface les trois tableaux', async () => {
      await patchProfile(mine, {
        allergens: ['milk', 'tree-nuts'],
        diets: ['vegetarian', 'pork-free'],
        excludedIngredients: [' Coriandre ', 'coriandre', 'abats'],
      });

      const written = await profileOf(mine);

      expect(written.allergens).toEqual(['milk', 'tree-nuts']);
      expect(written.diets).toEqual(['vegetarian', 'pork-free']);
      // Normalisés et dédoublonnés par le schéma partagé.
      expect(written.excludedIngredients).toEqual(['coriandre', 'abats']);

      // Absents : rien ne change.
      await patchProfile(mine, { name: 'Chez moi' });

      expect((await profileOf(mine)).allergens).toEqual(['milk', 'tree-nuts']);

      // Vides : les trois s'effacent.
      await patchProfile(mine, { allergens: [], diets: [], excludedIngredients: [] });

      const cleared = await profileOf(mine);

      expect(cleared.allergens).toEqual([]);
      expect(cleared.diets).toEqual([]);
      expect(cleared.excludedIngredients).toEqual([]);
    });

    it('pose la date du premier lancement, que la route rend en booléen', async () => {
      const before = await fetch(`${baseUrl}/household/onboarding`, {
        headers: { origin: baseUrl, cookie: other.cookie, 'x-forwarded-for': other.ip },
      });

      expect(await before.json()).toEqual({ done: false });

      await patchProfile(other, { onboardingDone: true });

      const after = await fetch(`${baseUrl}/household/onboarding`, {
        headers: { origin: baseUrl, cookie: other.cookie, 'x-forwarded-for': other.ip },
      });

      // Un booléen, et rien du profil : c'est tout ce que la garde de
      // navigation a besoin de savoir (ADR 0015).
      expect(await after.json()).toEqual({ done: true });

      const [row] = await database
        .select({ doneAt: household.onboardingDoneAt })
        .from(household)
        .where(eq(household.id, other.householdId));

      expect(row?.doneAt).toBeInstanceOf(Date);
    });
  });

  describe('ce que les réponses ne disent pas', () => {
    it('refuse un code inconnu sans renvoyer la valeur soumise', async () => {
      const response = await patchProfile(mine, { allergens: ['noisette-de-grand-mere'] });
      const problem = problemDetailsSchema.parse(await response.json());

      expect(response.status).toBe(400);
      expect(problem.errors?.map((item) => item.field)).toEqual(['allergens.0']);
      /*
        Le champ et le message, jamais la valeur : c'est la propriété du pipe de
        validation, et c'est ici qu'elle compte, une valeur soumise étant une
        donnée de santé (ADR 0016).
      */
      expect(JSON.stringify(problem)).not.toContain('noisette-de-grand-mere');
    });

    it('interdit la copie des trois réponses', async () => {
      const profile = await getProfile(mine);
      const onboarding = await fetch(`${baseUrl}/household/onboarding`, {
        headers: { origin: baseUrl, cookie: mine.cookie, 'x-forwarded-for': mine.ip },
      });
      const updated = await patchProfile(mine, {});

      for (const response of [profile, onboarding, updated]) {
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    });
  });
});
