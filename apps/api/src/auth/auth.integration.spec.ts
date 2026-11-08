import {
  backupCodesResponseSchema,
  CSRF_COOKIE,
  CSRF_HEADER,
  problemDetailsSchema,
  sessionResponseSchema,
  twoFactorSetupResponseSchema,
} from '@mijote/shared';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { createDatabase, type Database } from '../db/client.js';
import {
  account,
  accountTwoFactor,
  household,
  loginAttempt,
  rememberToken,
  session,
  twoFactorBackupCode,
} from '../db/schema.js';
import { loadEnvFile } from '../env.js';
import { encrypt, readEncryptionKey } from '../security/encryption.js';
import { hashPassword } from '../security/passwords.js';
import { fingerprint, readPepper } from '../security/pepper.js';
import { createTotpSecret, stepAt, totpCode } from '../security/totp.js';
import { resolveTrustProxy } from '../security/trust-proxy.js';

import { Roles } from './roles.decorator.js';

/*
  Le parcours de connexion, en entier, contre une vraie base.

  C'est le seul fichier qui mesure le SQL de auth.repository.ts, et le seul où
  une session existe vraiment : les gardes, la rotation du jeton de
  mémorisation, la révocation sur rejeu et la limitation des tentatives se
  voient ici, et pas ailleurs.

  Hors CI, il se saute quand PostgreSQL n'est pas joignable, pour qu'un
  `pnpm test` sans `docker compose up` reste vert. **En CI, il ne se saute
  jamais** : le service est déclaré dans .github/workflows/ci.yml, et un saut
  silencieux y laisserait tout le socle de la story non mesuré.
*/

loadEnvFile();

const DATABASE_URL = process.env['DATABASE_URL'];
const PASSWORD = 'un mot de passe assez long';

/** Un domaine réservé, qui n'existe nulle part. */
const EMAIL = `martin-${randomUUID()}@exemple.test`;
const UNKNOWN_EMAIL = `personne-${randomUUID()}@exemple.test`;
/** Une adresse à elle seule pour la limitation, qui compte par adresse. */
const FLOODED_EMAIL = `insistant-${randomUUID()}@exemple.test`;

/**
 * La base répond-elle, et les migrations sont-elles passées ?
 *
 * La requête porte sur une table de la migration 0001 : une base joignable mais
 * pas migrée est un oubli, et elle doit être traitée comme une base absente
 * plutôt que faire échouer chaque test pour une raison obscure.
 */
async function probeDatabase(url: string): Promise<boolean> {
  const probe = createDatabase(url);

  try {
    await probe.execute(sql`select 1 from ${session} limit 1`);

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
let householdId: string;
let accountId: string;
let adminId: string;

/** Un administrateur avec son second facteur, et un sans. */
const ADMIN_EMAIL = `admin-${randomUUID()}@exemple.test`;
const ADMIN_SECRET = createTotpSecret();

/** Les routes qui n'existent que pour ce test. */
@Controller('test-session')
class TestSessionController {
  @Get('mienne')
  mine(): { ok: true } {
    return { ok: true };
  }

  @Roles('admin')
  @Get('administration')
  administration(): { ok: true } {
    return { ok: true };
  }
}

@Module({ imports: [AppModule], controllers: [TestSessionController] })
class TestAppModule {}

/** Le problème renvoyé, sans son identifiant de requête. */
function sessionFailureBody(body: unknown): Record<string, unknown> {
  const problem = problemDetailsSchema.parse(body);
  const { requestId, ...rest } = problem;

  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

  return rest;
}

/** La valeur d'un cookie dans les en-têtes Set-Cookie d'une réponse. */
function cookieValue(response: Response, name: string): string | undefined {
  for (const header of response.headers.getSetCookie()) {
    if (header.startsWith(`${name}=`)) {
      const value = header.slice(name.length + 1).split(';')[0];

      return value === '' ? undefined : value;
    }
  }

  return undefined;
}

/** Un POST JSON avec ses cookies et son jeton CSRF, comme le front en fait. */
async function postJson(
  path: string,
  options: { cookie: string; csrf: string; body: unknown },
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      cookie: options.cookie,
      [CSRF_HEADER]: options.csrf,
    },
    body: JSON.stringify(options.body),
  });
}

/** Un en-tête Cookie, comme un navigateur l'enverrait. */
function cookieHeader(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function login(
  body: { email: string; password: string; remember?: boolean },
  ip = '203.0.113.7',
): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      // L'application est derrière un mandataire : l'adresse comptée est
      // celle-ci, et c'est ce qui permet de viser une IP par test.
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!reachable)('la connexion, contre une vraie base', () => {
  /*
    Les crochets vivent dans le describe, et non au niveau du fichier : sauté,
    il ne doit ni monter l'application ni écrire dans une base absente.
  */
  beforeAll(async () => {
    process.env['LOG_LEVEL'] = 'silent';
    process.env['SMTP_HOST'] ??= '127.0.0.1';
    process.env['SMTP_PORT'] ??= '1025';
    process.env['MAIL_FROM'] ??= 'Mijote <no-reply@mijote.local>';
    process.env['SECURITY_PEPPER'] ??= Buffer.alloc(32).toString('base64');
    process.env['SECURITY_TOTP_KEY'] ??= Buffer.alloc(32).toString('base64');
    process.env['APP_BASE_URL'] ??= 'https://mijote.local';

    database = createDatabase(DATABASE_URL ?? '');

    const [createdHousehold] = await database
      .insert(household)
      .values({ name: `Foyer de test ${randomUUID()}` })
      .returning({ id: household.id });

    householdId = createdHousehold?.id ?? '';

    const [createdAccount] = await database
      .insert(account)
      .values({
        householdId,
        email: EMAIL,
        passwordHash: await hashPassword(PASSWORD),
      })
      .returning({ id: account.id });

    accountId = createdAccount?.id ?? '';

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

    /*
      Le secret est écrit comme l'API l'écrirait : chiffré, avec la même clé et
      le même compte en donnée associée. C'est ce qui permet au test de calculer
      les codes que l'application d'authentification afficherait.
    */
    await database.insert(accountTwoFactor).values({
      accountId: adminId,
      secretCipher: encrypt(readEncryptionKey(process.env), adminId, ADMIN_SECRET),
      activatedAt: new Date(),
    });

    app = await NestFactory.create<NestExpressApplication>(TestAppModule, { logger: false });
    app.set('trust proxy', resolveTrustProxy(process.env));

    await app.listen(0);

    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    // Le foyer emporte en cascade son compte, ses sessions et ses jetons.
    await database.delete(household).where(sql`${household.id} = ${householdId}`);

    const pepper = readPepper(process.env);

    for (const email of [EMAIL, UNKNOWN_EMAIL, FLOODED_EMAIL]) {
      await database
        .delete(loginAttempt)
        .where(sql`${loginAttempt.emailFingerprint} = ${fingerprint(pepper, email)}`);
    }

    await app.close();
    await database.$client.end();
  });

  it('ouvre une session et pose les cookies', async () => {
    const response = await login({ email: EMAIL, password: PASSWORD });

    expect(response.status).toBe(200);
    /*
      Cette réponse porte un Set-Cookie, donc le jeton de session, et l'adresse
      du compte : ni le disque du poste ni un intermédiaire n'ont à en garder
      une copie après la session.
    */
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = sessionResponseSchema.parse(await response.json());

    expect(body.account).toEqual({ id: accountId, email: EMAIL, householdId, role: 'user' });

    const token = cookieValue(response, 'mijote_session');

    expect(token).toBeDefined();
    expect(cookieValue(response, CSRF_COOKIE)).toBeDefined();
    // Pas de mémorisation demandée : pas de troisième cookie.
    expect(cookieValue(response, 'mijote_remember')).toBeUndefined();

    const rows = await database.select().from(session);

    expect(rows.some((row) => row.accountId === accountId)).toBe(true);
    // Le jeton du cookie n'est nulle part en base, seule son empreinte y est.
    expect(rows.map((row) => row.tokenHash)).not.toContain(token);
  });

  it('refuse le même mot de passe sur une adresse inconnue, avec le même message', async () => {
    const unknown = await login({ email: UNKNOWN_EMAIL, password: PASSWORD });
    const wrong = await login({ email: EMAIL, password: 'pas le bon mot de passe' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);

    /*
      Mot pour mot le même corps, à l'identifiant de requête près : c'est lui
      qui relie l'erreur à sa trace côté serveur, et il change à chaque appel.
    */
    const first = { ...sessionFailureBody(await unknown.json()) };
    const second = { ...sessionFailureBody(await wrong.json()) };

    expect(first).toEqual(second);
    expect(first['status']).toBe(401);
    expect(first['detail']).toBe('Adresse e-mail ou mot de passe incorrect.');
  });

  it('donne accès à une route protégée, et la referme à la déconnexion', async () => {
    const opened = await login({ email: EMAIL, password: PASSWORD });
    const token = cookieValue(opened, 'mijote_session');
    const csrf = cookieValue(opened, CSRF_COOKIE);
    const cookie = cookieHeader({ mijote_session: token, [CSRF_COOKIE]: csrf ?? '' });

    expect((await fetch(`${baseUrl}/test-session/mienne`, { headers: { cookie } })).status).toBe(
      200,
    );

    // Sans cookie, la même route répond 401.
    expect((await fetch(`${baseUrl}/test-session/mienne`)).status).toBe(401);

    // Une route réservée aux administrateurs refuse ce compte.
    expect(
      (await fetch(`${baseUrl}/test-session/administration`, { headers: { cookie } })).status,
    ).toBe(403);

    // La déconnexion sans le jeton CSRF est refusée.
    const withoutToken = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl, cookie },
    });

    expect(withoutToken.status).toBe(403);

    const loggedOut = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        cookie,
        [CSRF_HEADER]: csrf ?? '',
      },
    });

    expect(loggedOut.status).toBe(204);
    // Les quatre cookies sont effacés : session, mémorisation, attente de
    // code et jeton CSRF.
    expect(
      loggedOut.headers.getSetCookie().filter((header) => header.includes('Max-Age=0')),
    ).toHaveLength(4);

    // La session est vraiment fermée côté serveur : le cookie ne vaut plus rien.
    expect((await fetch(`${baseUrl}/test-session/mienne`, { headers: { cookie } })).status).toBe(
      401,
    );
  });

  it('reprend la session mémorisée, fait tourner le jeton et révoque un rejeu', async () => {
    const opened = await login({ email: EMAIL, password: PASSWORD, remember: true });
    const remember = cookieValue(opened, 'mijote_remember');

    expect(remember).toBeDefined();

    // Le navigateur a été fermé : il ne reste que le cookie de mémorisation.
    const resumed = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader({ mijote_remember: remember }) },
    });

    expect(resumed.status).toBe(200);

    const rotated = cookieValue(resumed, 'mijote_remember');

    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(remember);
    expect(cookieValue(resumed, 'mijote_session')).toBeDefined();

    /*
      L'ancien cookie, présenté aussitôt : il est dans le délai de grâce, donc
      accepté, et aucun cookie de mémorisation n'est reposé. C'est le cas des
      deux onglets qui se chargent en même temps, mesuré ici contre le vrai SQL.
    */
    const inGrace = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader({ mijote_remember: remember }) },
    });

    expect(inGrace.status).toBe(200);
    expect(cookieValue(inGrace, 'mijote_remember')).toBeUndefined();

    /*
      Le rejeu, hors délai de grâce : la rotation est vieillie en base, puis
      l'ancien cookie est présenté à nouveau. Toute la famille doit tomber.
    */
    const family = remember?.split('.')[0] ?? '';

    await database
      .update(rememberToken)
      .set({ rotatedAt: new Date(Date.now() - 60_000) })
      .where(sql`${rememberToken.family} = ${family}`);

    const replayed = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader({ mijote_remember: remember }) },
    });

    expect(replayed.status).toBe(401);

    // Et le jeton qui avait tourné ne vaut plus rien non plus.
    const afterRevocation = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader({ mijote_remember: rotated }) },
    });

    expect(afterRevocation.status).toBe(401);
  });

  it('bloque après cinq échecs sur une même adresse', async () => {
    const ip = '203.0.113.90';

    for (let count = 0; count < 5; count += 1) {
      const refused = await login({ email: FLOODED_EMAIL, password: 'faux' }, ip);

      expect(refused.status).toBe(401);
    }

    const blocked = await login({ email: FLOODED_EMAIL, password: 'faux' }, ip);

    expect(blocked.status).toBe(429);

    const problem: unknown = await blocked.json();

    expect(JSON.stringify(problem)).toContain('Trop de tentatives');

    /*
      La même IP, une autre adresse : elle passe encore, parce que la limite par
      IP est plus haute. C'est ce qui permet à deux personnes d'un même foyer de
      se tromper sans se bloquer l'une l'autre.
    */
    const other = await login({ email: EMAIL, password: PASSWORD }, ip);

    expect(other.status).toBe(200);
  });

  it('demande un code à un administrateur, et ouvre la session après lui', async () => {
    const started = await login({ email: ADMIN_EMAIL, password: PASSWORD });

    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ twoFactorRequired: true });

    // Aucune session ouverte au mot de passe : seulement l'attente.
    const pendingToken = cookieValue(started, 'mijote_pending');
    const pendingCsrf = cookieValue(started, CSRF_COOKIE);

    expect(pendingToken).toBeDefined();
    expect(cookieValue(started, 'mijote_session')).toBeUndefined();

    const cookie = cookieHeader({
      mijote_pending: pendingToken,
      [CSRF_COOKIE]: pendingCsrf ?? '',
    });

    /*
      La soumission du code garde les trois barrières : sans l'en-tête CSRF,
      elle est refusée, parce que l'attente porte son propre secret et n'est pas
      dans la liste des routes exemptées.
    */
    const withoutToken = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl, cookie },
      body: JSON.stringify({ code: totpCode(ADMIN_SECRET, stepAt(new Date())) }),
    });

    expect(withoutToken.status).toBe(403);

    // Les deux autres barrières s'observent ici, l'attente étant valide : le
    // type de média, puis l'origine.
    const wrongMediaType = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: baseUrl, cookie },
      body: JSON.stringify({ code: totpCode(ADMIN_SECRET, stepAt(new Date())) }),
    });

    expect(wrongMediaType.status).toBe(415);

    const wrongOrigin = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://ailleurs.example',
        cookie,
        [CSRF_HEADER]: pendingCsrf ?? '',
      },
      body: JSON.stringify({ code: totpCode(ADMIN_SECRET, stepAt(new Date())) }),
    });

    expect(wrongOrigin.status).toBe(403);

    const verified = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        cookie,
        [CSRF_HEADER]: pendingCsrf ?? '',
      },
      body: JSON.stringify({ code: totpCode(ADMIN_SECRET, stepAt(new Date())) }),
    });

    expect(verified.status).toBe(200);

    const body = sessionResponseSchema.parse(await verified.json());

    expect(body.account.id).toBe(adminId);
    expect(body.twoFactor).toEqual({ active: true, adminUnlocked: true });

    const sessionToken = cookieValue(verified, 'mijote_session');
    const sessionCsrf = cookieValue(verified, CSRF_COOKIE);

    expect(sessionToken).toBeDefined();

    // La route d'administration accepte cette session : rôle, second facteur
    // actif, et code validé dans cette session.
    const allowed = await fetch(`${baseUrl}/test-session/administration`, {
      headers: { cookie: cookieHeader({ mijote_session: sessionToken }) },
    });

    expect(allowed.status).toBe(200);
    expect(sessionCsrf).toBeDefined();
  });

  it('refuse un code faux, puis le même code deux fois', async () => {
    const started = await login({ email: ADMIN_EMAIL, password: PASSWORD });
    const cookie = cookieHeader({
      mijote_pending: cookieValue(started, 'mijote_pending'),
      [CSRF_COOKIE]: cookieValue(started, CSRF_COOKIE) ?? '',
    });
    const csrf = cookieValue(started, CSRF_COOKIE) ?? '';

    async function submit(code: string): Promise<Response> {
      return fetch(`${baseUrl}/auth/two-factor`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseUrl,
          cookie,
          [CSRF_HEADER]: csrf,
        },
        body: JSON.stringify({ code }),
      });
    }

    const wrong = await submit('000000');

    expect(wrong.status).toBe(401);
    expect(JSON.stringify(await wrong.json())).toContain('Code incorrect ou expiré.');

    /*
      La fenêtre suivante, et non celle du moment : le test précédent vient de
      consommer le code courant, et le rejeu est fermé pour toute la fenêtre.
      C'est la tolérance d'un pas qui rend celui-ci acceptable.
    */
    const code = totpCode(ADMIN_SECRET, stepAt(new Date()) + 1);

    expect((await submit(code)).status).toBe(200);

    // Le rejeu, contre le vrai SQL : le pas accepté est retenu.
    const replayed = await login({ email: ADMIN_EMAIL, password: PASSWORD });
    const replayedCsrf = cookieValue(replayed, CSRF_COOKIE) ?? '';
    const again = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: cookieHeader({
          mijote_pending: cookieValue(replayed, 'mijote_pending'),
          [CSRF_COOKIE]: replayedCsrf,
        }),
        [CSRF_HEADER]: replayedCsrf,
      },
      body: JSON.stringify({ code }),
    });

    expect(again.status).toBe(401);
  });

  it("rouvre l'application par la mémorisation, mais pas l'administration", async () => {
    /*
      L'arbitrage de l'ADR 0012, mesuré de bout en bout : un cookie de
      mémorisation volé donne l'application, jamais l'administration. La
      session reprise naît sans droits, et c'est un code qui les ouvre.

      Son propre compte, avec son propre secret : le pas accepté ne redescend
      jamais, donc deux tests qui partageraient un compte se marcheraient sur
      les pieds au bout d'une minute.
    */
    const secret = createTotpSecret();
    const email = `admin-memorise-${randomUUID()}@exemple.test`;
    const [owner] = await database
      .insert(account)
      .values({ householdId, email, passwordHash: await hashPassword(PASSWORD), role: 'admin' })
      .returning({ id: account.id });

    await database.insert(accountTwoFactor).values({
      accountId: owner?.id ?? '',
      secretCipher: encrypt(readEncryptionKey(process.env), owner?.id ?? '', secret),
      activatedAt: new Date(),
    });

    const started = await login({ email, password: PASSWORD, remember: true });
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
      },
      body: JSON.stringify({ code: totpCode(secret, stepAt(new Date())) }),
    });

    expect(verified.status).toBe(200);

    const remembered = cookieValue(verified, 'mijote_remember');

    expect(remembered).toBeDefined();

    // Le navigateur a été fermé : il ne reste que le cookie de mémorisation.
    const resumed = await fetch(`${baseUrl}/auth/session`, {
      headers: { cookie: cookieHeader({ mijote_remember: remembered }) },
    });

    expect(resumed.status).toBe(200);

    const resumedCsrf = cookieValue(resumed, CSRF_COOKIE) ?? '';
    const resumedCookie = cookieHeader({
      mijote_session: cookieValue(resumed, 'mijote_session'),
      [CSRF_COOKIE]: resumedCsrf,
    });

    // L'application répond, l'administration non.
    expect(
      (await fetch(`${baseUrl}/test-session/mienne`, { headers: { cookie: resumedCookie } }))
        .status,
    ).toBe(200);

    const refused = await fetch(`${baseUrl}/test-session/administration`, {
      headers: { cookie: resumedCookie },
    });

    expect(refused.status).toBe(403);
    expect(JSON.stringify(await refused.json())).toContain('demande un code');

    // Un code de la fenêtre suivante, celui du moment ayant servi plus haut.
    const unlocked = await fetch(`${baseUrl}/auth/two-factor/unlock`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: resumedCookie,
        [CSRF_HEADER]: resumedCsrf,
      },
      body: JSON.stringify({ code: totpCode(secret, stepAt(new Date()) + 1) }),
    });

    expect(unlocked.status).toBe(204);
    expect(
      (
        await fetch(`${baseUrl}/test-session/administration`, {
          headers: { cookie: resumedCookie },
        })
      ).status,
    ).toBe(200);
  });

  it("inscrit une application, s'en sert, puis la retire", async () => {
    /*
      Le chemin d'activation contre le vrai SQL : c'est le seul endroit où
      `upsertInactiveTwoFactor` et sa condition, l'activation conditionnelle
      avec ses dix codes dans la même transaction, la consommation d'un code de
      secours et la suppression sont mesurés. Les faux en mémoire reproduisent
      ces conditions, mais c'est ici qu'on sait qu'elles tiennent en base.
    */
    const email = `admin-inscription-${randomUUID()}@exemple.test`;
    const [owner] = await database
      .insert(account)
      .values({ householdId, email, passwordHash: await hashPassword(PASSWORD), role: 'admin' })
      .returning({ id: account.id });

    const opened = await login({ email, password: PASSWORD });

    expect(opened.status).toBe(200);

    const sessionCookie = cookieHeader({
      mijote_session: cookieValue(opened, 'mijote_session'),
      [CSRF_COOKIE]: cookieValue(opened, CSRF_COOKIE) ?? '',
    });
    const sessionCsrf = cookieValue(opened, CSRF_COOKIE) ?? '';

    // L'inscription : la réponse porte le secret, donc elle interdit sa copie.
    const started = await postJson('/auth/two-factor/setup', {
      cookie: sessionCookie,
      csrf: sessionCsrf,
      body: { password: PASSWORD },
    });

    expect(started.status).toBe(200);
    expect(started.headers.get('cache-control')).toBe('no-store');

    const enrollment = twoFactorSetupResponseSchema.parse(await started.json());

    expect(enrollment.uri).toContain(enrollment.key);
    // Rien n'est actif tant qu'aucun code n'a confirmé.
    const [inactive] = await database
      .select()
      .from(accountTwoFactor)
      .where(eq(accountTwoFactor.accountId, owner?.id ?? ''));

    expect(inactive?.activatedAt).toBeNull();
    // Le secret est chiffré en base, et la ligne ne porte pas la clé en clair.
    expect(inactive?.secretCipher).not.toContain(enrollment.key);

    const activated = await postJson('/auth/two-factor/activate', {
      cookie: sessionCookie,
      csrf: sessionCsrf,
      body: { password: PASSWORD, code: totpCode(enrollment.key, stepAt(new Date())) },
    });

    expect(activated.status).toBe(200);

    const backupCodes = backupCodesResponseSchema.parse(await activated.json()).codes;

    expect(backupCodes).toHaveLength(10);

    const rows = await database
      .select()
      .from(twoFactorBackupCode)
      .where(eq(twoFactorBackupCode.accountId, owner?.id ?? ''));

    expect(rows).toHaveLength(10);
    // Les codes ne sont en base que hachés en Argon2id.
    for (const code of backupCodes) {
      expect(JSON.stringify(rows)).not.toContain(code.replace(/-/g, ''));
    }

    for (const row of rows) {
      expect(row.codeHash).toMatch(/^\$argon2id\$/);
    }

    /*
      Un code de secours ouvre une session, et ne sert qu'une fois. La
      consommation est conditionnelle en SQL : c'est elle qu'on mesure ici.
    */
    const first = backupCodes[0] ?? '';

    for (const expected of [200, 401]) {
      const attempt = await login({ email, password: PASSWORD });
      const pendingCsrf = cookieValue(attempt, CSRF_COOKIE) ?? '';
      const submitted = await postJson('/auth/two-factor', {
        cookie: cookieHeader({
          mijote_pending: cookieValue(attempt, 'mijote_pending'),
          [CSRF_COOKIE]: pendingCsrf,
        }),
        csrf: pendingCsrf,
        body: { code: first },
      });

      expect(submitted.status, `code de secours, essai attendu en ${String(expected)}`).toBe(
        expected,
      );
    }

    // La désactivation : mot de passe et code, et tout part avec elle.
    const disabled = await postJson('/auth/two-factor/disable', {
      cookie: sessionCookie,
      csrf: sessionCsrf,
      body: { password: PASSWORD, code: totpCode(enrollment.key, stepAt(new Date()) + 1) },
    });

    expect(disabled.status).toBe(204);
    expect(
      await database
        .select()
        .from(accountTwoFactor)
        .where(eq(accountTwoFactor.accountId, owner?.id ?? '')),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(twoFactorBackupCode)
        .where(eq(twoFactorBackupCode.accountId, owner?.id ?? '')),
    ).toEqual([]);
  });

  it("conduit à l'activation un administrateur qui n'en a pas", async () => {
    /*
      Le second facteur est obligatoire pour ce rôle : la session existe, mais
      aucune route d'administration ne l'accepte, et le message dit quoi faire.
    */
    const [other] = await database
      .insert(account)
      .values({
        householdId,
        email: `admin-sans-${randomUUID()}@exemple.test`,
        passwordHash: await hashPassword(PASSWORD),
        role: 'admin',
      })
      .returning({ id: account.id, email: account.email });

    const opened = await login({ email: other?.email ?? '', password: PASSWORD });

    expect(opened.status).toBe(200);

    const refused = await fetch(`${baseUrl}/test-session/administration`, {
      headers: { cookie: cookieHeader({ mijote_session: cookieValue(opened, 'mijote_session') }) },
    });

    expect(refused.status).toBe(403);
    expect(JSON.stringify(await refused.json())).toContain('Activez-la');
  });

  it("n'écrit que des empreintes dans la table des tentatives", async () => {
    const rows = await database.select().from(loginAttempt);
    const written = JSON.stringify(rows);

    expect(rows.length).toBeGreaterThan(0);
    expect(written).not.toContain('exemple.test');
    expect(written).not.toContain('203.0.113');
  });
});
