import {
  CSRF_COOKIE,
  CSRF_HEADER,
  invitationListSchema,
  invitationPreviewSchema,
  invitationSchema,
  problemDetailsSchema,
  sessionResponseSchema,
} from '@mijote/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { createDatabase, type Database } from '../db/client.js';
import { account, accountTwoFactor, household, invitation, loginAttempt } from '../db/schema.js';
import { loadEnvFile } from '../env.js';
import { encrypt, readEncryptionKey } from '../security/encryption.js';
import { hashPassword } from '../security/passwords.js';
import { fingerprint, readPepper } from '../security/pepper.js';
import { hashSecret } from '../security/tokens.js';
import { createTotpSecret, stepAt, totpCode } from '../security/totp.js';
import { resolveTrustProxy } from '../security/trust-proxy.js';

/*
  Les invitations de bout en bout : l'API, PostgreSQL, et Mailpit.

  C'est le seul fichier qui mesure le SQL de invitation.repository.ts, et le
  seul où le lien d'invitation est lu là où il arrive vraiment, dans un
  message. Ce qui ne s'y voit pas se mesure dans invitations.service.spec.ts,
  en mémoire.

  Trois choses ne peuvent se mesurer qu'ici : l'index unique partiel, qui
  n'autorise qu'une invitation vivante par adresse ; la consommation
  conditionnelle, sous deux acceptations simultanées ; et les deux barrières
  que gardent les routes exemptées du jeton CSRF.

  Hors CI, il se saute quand PostgreSQL ou Mailpit n'est pas joignable, pour
  qu'un `pnpm test` sans `docker compose up` reste vert. **En CI, il ne se
  saute jamais** : les deux services sont déclarés dans
  .github/workflows/ci.yml.
*/

loadEnvFile();

const DATABASE_URL = process.env['DATABASE_URL'];

const HOST = process.env['SMTP_HOST'] ?? '127.0.0.1';
const MAILPIT_WEB = `http://${HOST}:${process.env['MAILPIT_WEB_PORT'] ?? '8025'}`;

const PASSWORD = 'un mot de passe assez long';
const BASE_URL = 'https://mijote.local';

/** Un domaine réservé, qui n'existe nulle part. */
const ADMIN_EMAIL = `admin-${randomUUID()}@exemple.test`;
const INVITED = `invite-${randomUUID()}@exemple.test`;
const RACED = `course-${randomUUID()}@exemple.test`;
const REPLACED = `remplace-${randomUUID()}@exemple.test`;
const DOUBLE_LIVE = `double-${randomUUID()}@exemple.test`;
const TRIGGER = `declencheur-${randomUUID()}@exemple.test`;
const PURGED = `purge-${randomUUID()}@exemple.test`;
const KEPT = `garde-${randomUUID()}@exemple.test`;

/** Toutes les adresses à nettoyer : comptes, foyers et invitations. */
const EMAILS = [ADMIN_EMAIL, INVITED, RACED, REPLACED, DOUBLE_LIVE, TRIGGER, PURGED, KEPT];

/** Une IP par test : la limitation compte par IP, et ne doit pas les mêler. */
const IPS = {
  admin: '203.0.113.10',
  invited: '203.0.113.11',
  raced: '203.0.113.12',
  replaced: '203.0.113.13',
};

const ADMIN_SECRET = createTotpSecret();

const UNUSABLE = "Ce lien n'est plus valable. Demandez une nouvelle invitation.";

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function probeDatabase(url: string): Promise<boolean> {
  const probe = createDatabase(url);

  try {
    // La table de la migration 0005 : une base non migrée vaut une base absente.
    await probe.execute(sql`select 1 from ${invitation} limit 1`);

    return true;
  } catch {
    return false;
  } finally {
    await probe.$client.end();
  }
}

/** Mailpit répond-il ? Plusieurs tentatives, le conteneur pouvant démarrer. */
async function probeMailpit(): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(`${MAILPIT_WEB}/readyz`, { signal: AbortSignal.timeout(1_000) });

      if (response.ok) {
        return true;
      }
    } catch {
      // Pas encore prêt, ou pas lancé du tout : on retente.
    }

    await wait(300);
  }

  return false;
}

const database_reachable = DATABASE_URL === undefined ? false : await probeDatabase(DATABASE_URL);
const mail_reachable = await probeMailpit();
const reachable = database_reachable && mail_reachable;

if (!reachable && process.env['CI'] === 'true') {
  throw new Error(
    `PostgreSQL (joignable : ${String(database_reachable)}) ou Mailpit (joignable : ${String(mail_reachable)}) manque alors que CI est posée : les services sont déclarés dans .github/workflows/ci.yml, et ce test ne doit pas se sauter en CI.`,
  );
}

let database: Database;
let app: NestExpressApplication;
let baseUrl: string;
let householdId: string;
let adminId: string;
/** La session de l'administrateur : rôle, second facteur, code validé. */
let adminCookie: string;
let adminCsrf: string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cookieHeader(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function cookieValue(response: Response, name: string): string | undefined {
  for (const header of response.headers.getSetCookie()) {
    if (header.startsWith(`${name}=`)) {
      const value = header.slice(name.length + 1).split(';')[0];

      return value === '' ? undefined : value;
    }
  }

  return undefined;
}

/** Un POST JSON d'administration, avec ses cookies et son jeton CSRF. */
async function postAsAdmin(path: string, body?: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      cookie: adminCookie,
      [CSRF_HEADER]: adminCsrf,
      'x-forwarded-for': IPS.admin,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * Un POST sur une route publique d'invitation.
 *
 * Aucun jeton CSRF : ces deux routes en sont exemptées, aucune session ne les
 * précédant. L'origine et le type de média, eux, sont bien là.
 */
async function postPublic(
  path: string,
  body: unknown,
  options: { ip: string; origin?: string; contentType?: string } = { ip: IPS.invited },
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': options.contentType ?? 'application/json',
      origin: options.origin ?? baseUrl,
      'x-forwarded-for': options.ip,
    },
    body: JSON.stringify(body),
  });
}

/** Le texte du dernier message reçu par cette adresse, lu dans Mailpit. */
async function waitForMail(to: string): Promise<string> {
  const query = encodeURIComponent(`to:${to}`);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${MAILPIT_WEB}/api/v1/search?query=${query}`);
    const body: unknown = await response.json();
    const messages = isRecord(body) ? body['messages'] : undefined;
    // Annotée : `Array.isArray` sur une valeur inconnue rend un tableau de
    // `any`, que la règle no-unsafe-assignment refuse à juste titre.
    const summary: unknown = Array.isArray(messages) ? messages[0] : undefined;
    const id = isRecord(summary) ? summary['ID'] : undefined;

    if (typeof id === 'string') {
      const detail: unknown = await (await fetch(`${MAILPIT_WEB}/api/v1/message/${id}`)).json();
      const text = isRecord(detail) ? detail['Text'] : undefined;

      if (typeof text === 'string') {
        return text;
      }
    }

    await wait(100);
  }

  throw new Error(`aucun message pour ${to} dans Mailpit`);
}

/**
 * Le jeton que porte le lien, pris dans le **fragment**.
 *
 * Que le test doive le lire là, et nulle part ailleurs, est précisément ce
 * qu'il mesure : un fragment n'est jamais envoyé au serveur (ADR 0013).
 */
function tokenInFragment(text: string): string {
  const found = new RegExp(`${BASE_URL}/invitation#([A-Za-z0-9_-]+)`).exec(text);
  const token = found?.[1];

  if (token === undefined) {
    throw new Error(`aucun jeton dans le fragment du lien : ${text}`);
  }

  return token;
}

/**
 * Le message de la cause, là où PostgreSQL nomme la contrainte.
 *
 * Drizzle, lui, recopie la requête **et ses paramètres** dans son propre
 * message, donc l'adresse e-mail : c'est la raison pour laquelle le
 * sérialiseur des journaux ne laisse jamais passer une erreur de requête
 * telle quelle (mesuré pour la story #10).
 */
function causeMessage(error: unknown): string {
  if (error instanceof Error && error.cause instanceof Error) {
    return error.cause.message;
  }

  return error instanceof Error ? error.message : String(error);
}

/** Ne supprime que les messages de ce test, pas la boîte de développement. */
async function deleteTestMessages(): Promise<void> {
  for (const email of EMAILS) {
    await fetch(`${MAILPIT_WEB}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, {
      method: 'DELETE',
    });
  }
}

describe.skipIf(!reachable)('les invitations, contre une vraie base', () => {
  beforeAll(async () => {
    process.env['LOG_LEVEL'] = 'silent';
    process.env['SMTP_HOST'] ??= '127.0.0.1';
    process.env['SMTP_PORT'] ??= '1025';
    process.env['MAIL_FROM'] ??= 'Mijote <no-reply@mijote.local>';
    process.env['SECURITY_PEPPER'] ??= Buffer.alloc(32).toString('base64');
    process.env['SECURITY_TOTP_KEY'] ??= Buffer.alloc(32).toString('base64');
    // Lue au démarrage du module : elle décide du domaine des liens.
    process.env['APP_BASE_URL'] = BASE_URL;

    database = createDatabase(DATABASE_URL ?? '');

    await deleteTestMessages();

    const [createdHousehold] = await database
      .insert(household)
      .values({ name: `Foyer de test ${randomUUID()}` })
      .returning({ id: household.id });

    householdId = createdHousehold?.id ?? '';

    const [createdAdmin] = await database
      .insert(account)
      .values({
        householdId,
        email: ADMIN_EMAIL,
        passwordHash: await hashPassword(PASSWORD),
        role: 'admin',
      })
      .returning({ id: account.id });

    adminId = createdAdmin?.id ?? '';

    // Le second facteur, écrit comme l'API l'écrirait : le test peut donc
    // calculer les codes que l'application d'authentification afficherait.
    await database.insert(accountTwoFactor).values({
      accountId: adminId,
      secretCipher: encrypt(readEncryptionKey(process.env), adminId, ADMIN_SECRET),
      activatedAt: new Date(),
    });

    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    app.set('trust proxy', resolveTrustProxy(process.env));

    await app.listen(0);

    baseUrl = await app.getUrl();

    /*
      Une seule session d'administration, ouverte ici et partagée : un code TOTP
      ne se rejoue pas, donc ouvrir une session par test demanderait d'attendre
      le pas suivant.
    */
    const started = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        'x-forwarded-for': IPS.admin,
      },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: PASSWORD }),
    });

    const pendingCsrf = cookieValue(started, CSRF_COOKIE) ?? '';
    const verified = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: cookieHeader({
          mijote_pending: cookieValue(started, 'mijote_pending'),
          [CSRF_COOKIE]: pendingCsrf,
        }),
        [CSRF_HEADER]: pendingCsrf,
        'x-forwarded-for': IPS.admin,
      },
      body: JSON.stringify({ code: totpCode(ADMIN_SECRET, stepAt(new Date())) }),
    });

    if (verified.status !== 200) {
      throw new Error(`la session d'administration ne s'est pas ouverte : ${verified.status}`);
    }

    adminCsrf = cookieValue(verified, CSRF_COOKIE) ?? '';
    adminCookie = cookieHeader({
      mijote_session: cookieValue(verified, 'mijote_session'),
      [CSRF_COOKIE]: adminCsrf,
    });
  });

  afterAll(async () => {
    const pepper = readPepper(process.env);

    for (const email of EMAILS) {
      await database.delete(invitation).where(eq(invitation.email, email));

      // Chaque invité a créé son propre foyer : il emporte son compte.
      const owned = await database
        .select({ householdId: account.householdId })
        .from(account)
        .where(eq(account.email, email));

      for (const row of owned) {
        await database.delete(household).where(eq(household.id, row.householdId));
      }

      await database
        .delete(loginAttempt)
        .where(eq(loginAttempt.emailFingerprint, fingerprint(pepper, email)));
    }

    for (const ip of Object.values(IPS)) {
      await database
        .delete(loginAttempt)
        .where(eq(loginAttempt.ipFingerprint, fingerprint(pepper, ip)));
    }

    await database.delete(household).where(eq(household.id, householdId));
    await deleteTestMessages();
    await app.close();
    await database.$client.end();
  });

  it("invite, et le lien n'existe que dans le message", async () => {
    const created = await postAsAdmin('/invitations', { email: INVITED, role: 'user' });

    expect(created.status).toBe(201);

    const invited = invitationSchema.parse(await created.json());

    expect(invited.email).toBe(INVITED);
    expect(invited.status).toBe('pending');

    const token = tokenInFragment(await waitForMail(INVITED));
    const [row] = await database
      .select({ tokenHash: invitation.tokenHash })
      .from(invitation)
      .where(eq(invitation.id, invited.id));

    // La base ne porte qu'une empreinte : le jeton lui-même n'existe que dans
    // le message, et dans la barre d'adresse de qui l'a reçu.
    expect(row?.tokenHash).toBe(hashSecret(token));
  });

  it('garde les deux autres barrières sur les routes exemptées du jeton CSRF', async () => {
    /*
      Elles n'ont pas de jeton à présenter, aucune session ne les précédant,
      mais elles gardent l'origine et le type de média. Ce n'est pas une
      précaution de style : l'acceptation ouvre une session, donc un site tiers
      pourrait sinon connecter une victime à un compte qu'il contrôle.

      Que ces deux routes soient bien exemptées se lit au test suivant, qui les
      appelle sans jeton et obtient 200 puis 201 : sans lui, un refus ici ne
      prouverait rien, une route non exemptée refusant de toute façon.
    */
    const token = tokenInFragment(await waitForMail(INVITED));

    for (const path of ['/invitations/preview', '/invitations/accept']) {
      const body = { token, password: PASSWORD };

      const wrongOrigin = await postPublic(path, body, {
        ip: IPS.invited,
        origin: 'https://ailleurs.example',
      });

      expect(wrongOrigin.status, path).toBe(403);

      const wrongMediaType = await postPublic(path, body, {
        ip: IPS.invited,
        contentType: 'text/plain',
      });

      expect(wrongMediaType.status, path).toBe(415);
    }

    // Aucun compte n'a été créé par ces tentatives.
    const [existing] = await database
      .select({ id: account.id })
      .from(account)
      .where(eq(account.email, INVITED));

    expect(existing).toBeUndefined();
  });

  it("montre l'adresse, puis crée le compte et son foyer, et ouvre la session", async () => {
    const token = tokenInFragment(await waitForMail(INVITED));

    const previewed = await postPublic('/invitations/preview', { token }, { ip: IPS.invited });

    expect(previewed.status).toBe(200);
    expect(previewed.headers.get('cache-control')).toBe('no-store');
    expect(invitationPreviewSchema.parse(await previewed.json())).toEqual({ email: INVITED });

    const accepted = await postPublic(
      '/invitations/accept',
      { token, password: PASSWORD },
      { ip: IPS.invited },
    );

    expect(accepted.status).toBe(201);

    const body = sessionResponseSchema.parse(await accepted.json());

    expect(body.account.email).toBe(INVITED);
    expect(body.account.role).toBe('user');
    // Son propre foyer, et non celui de l'administrateur : l'invitation est un
    // ticket d'inscription, elle ne rattache à rien (ADR 0013).
    expect(body.account.householdId).not.toBe(householdId);
    expect(body.twoFactor).toEqual({ active: false });

    // La session est ouverte : le cookie posé répond sans repasser par le
    // formulaire de connexion.
    const session = await fetch(`${baseUrl}/auth/session`, {
      headers: {
        cookie: cookieHeader({ mijote_session: cookieValue(accepted, 'mijote_session') }),
      },
    });

    expect(session.status).toBe(200);
    expect(sessionResponseSchema.parse(await session.json()).account.email).toBe(INVITED);

    // Et le ticket est consommé : le même lien ne sert pas deux fois.
    const again = await postPublic(
      '/invitations/accept',
      { token, password: PASSWORD },
      { ip: IPS.invited },
    );

    expect(again.status).toBe(410);
    expect(problemDetailsSchema.parse(await again.json()).detail).toBe(UNUSABLE);

    // L'administrateur la voit désormais utilisée.
    const listed = await fetch(`${baseUrl}/invitations`, { headers: { cookie: adminCookie } });
    const { invitations } = invitationListSchema.parse(await listed.json());

    expect(invitations.find((row) => row.email === INVITED)?.status).toBe('used');
  });

  it('refuse une adresse qui a déjà un compte', async () => {
    const refused = await postAsAdmin('/invitations', { email: INVITED, role: 'user' });

    expect(refused.status).toBe(409);
    expect(problemDetailsSchema.parse(await refused.json()).detail).toBe(
      'Un compte existe déjà pour cette adresse.',
    );
  });

  it("n'autorise qu'une invitation vivante par adresse", async () => {
    const created = await postAsAdmin('/invitations', { email: DOUBLE_LIVE, role: 'user' });

    expect(created.status).toBe(201);

    /*
      L'index unique partiel, mesuré en essayant de le contourner : une seconde
      invitation vivante pour la même adresse est refusée par la base
      elle-même, et non par une lecture préalable qui laisserait passer deux
      écritures simultanées.
    */
    const failure = await database
      .insert(invitation)
      .values({
        email: DOUBLE_LIVE,
        role: 'user',
        tokenHash: hashSecret('un-autre-jeton'),
        invitedBy: adminId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .then(() => undefined)
      .catch((error: unknown) => error);

    expect(causeMessage(failure)).toContain('invitation_email_live_unique');
  });

  it("remplace une invitation expirée que personne n'a révoquée", async () => {
    /*
      Le prédicat de l'index ne peut pas tenir compte de l'heure, `now()`
      n'étant pas immuable : une invitation expirée mais non révoquée occupe
      donc encore la place. C'est la création qui la révoque, dans la même
      transaction (ADR 0013).
    */
    const [stale] = await database
      .insert(invitation)
      .values({
        email: REPLACED,
        role: 'user',
        tokenHash: hashSecret('un-jeton-périmé'),
        invitedBy: adminId,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      .returning({ id: invitation.id });

    const created = await postAsAdmin('/invitations', { email: REPLACED, role: 'admin' });

    expect(created.status).toBe(201);

    const [previous] = await database
      .select({ revokedAt: invitation.revokedAt })
      .from(invitation)
      .where(eq(invitation.id, stale?.id ?? ''));

    expect(previous?.revokedAt).not.toBeNull();

    // Et il ne reste qu'une invitation vivante pour cette adresse.
    const live = await database
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.email, REPLACED),
          sql`${invitation.usedAt} is null`,
          sql`${invitation.revokedAt} is null`,
        ),
      );

    expect(live).toHaveLength(1);

    // Le nouveau lien marche, et porte le rôle demandé cette fois-ci.
    const token = tokenInFragment(await waitForMail(REPLACED));
    const accepted = await postPublic(
      '/invitations/accept',
      { token, password: PASSWORD },
      { ip: IPS.replaced },
    );

    expect(accepted.status).toBe(201);
    expect(sessionResponseSchema.parse(await accepted.json()).account.role).toBe('admin');
  });

  it("ne crée qu'un compte sous deux acceptations simultanées", async () => {
    const created = await postAsAdmin('/invitations', { email: RACED, role: 'user' });

    expect(created.status).toBe(201);

    const token = tokenInFragment(await waitForMail(RACED));

    /*
      L'écriture conditionnelle, mesurée : les deux requêtes partent ensemble,
      et c'est l'UPDATE conditionnel sur `used_at` qui départage. Sans lui, les
      deux liraient une invitation en attente, et la seconde échouerait sur
      l'unicité de l'adresse après avoir haché un mot de passe.
    */
    const [first, second] = await Promise.all([
      postPublic('/invitations/accept', { token, password: PASSWORD }, { ip: IPS.raced }),
      postPublic('/invitations/accept', { token, password: PASSWORD }, { ip: IPS.raced }),
    ]);

    expect([first.status, second.status].sort((left, right) => left - right)).toEqual([201, 410]);

    const accounts = await database
      .select({ id: account.id })
      .from(account)
      .where(eq(account.email, RACED));

    expect(accounts).toHaveLength(1);
  });

  it('efface les invitations terminées depuis trente jours', async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    const [finished] = await database
      .insert(invitation)
      .values({
        email: PURGED,
        role: 'user',
        tokenHash: hashSecret(`à-purger-${randomUUID()}`),
        invitedBy: adminId,
        expiresAt: old,
        createdAt: old,
      })
      .returning({ id: invitation.id });

    const [pending] = await database
      .insert(invitation)
      .values({
        email: KEPT,
        role: 'user',
        tokenHash: hashSecret(`à-garder-${randomUUID()}`),
        invitedBy: adminId,
        // Créée il y a longtemps, mais toujours en attente : elle reste.
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: old,
      })
      .returning({ id: invitation.id });

    // La purge est accrochée à l'envoi d'une invitation.
    const created = await postAsAdmin('/invitations', { email: TRIGGER, role: 'user' });

    expect(created.status).toBe(201);

    const remaining = await database
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.id, finished?.id ?? ''));

    expect(remaining).toHaveLength(0);

    const kept = await database
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.id, pending?.id ?? ''));

    expect(kept).toHaveLength(1);
  });
});
