import { loginResponseSchema, problemDetailsSchema, sessionResponseSchema } from '@mijote/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { createDatabase, type Database } from '../db/client.js';
import {
  account,
  accountTwoFactor,
  household,
  loginAttempt,
  passwordReset,
  rememberToken,
  session,
  twoFactorBackupCode,
} from '../db/schema.js';
import { loadEnvFile } from '../env.js';
import { encrypt, readEncryptionKey } from '../security/encryption.js';
import { hashPassword } from '../security/passwords.js';
import { fingerprint, readPepper } from '../security/pepper.js';
import { hashSecret } from '../security/tokens.js';
import { createTotpSecret } from '../security/totp.js';
import { resolveTrustProxy } from '../security/trust-proxy.js';

/*
  La réinitialisation de bout en bout : l'API, PostgreSQL, et Mailpit.

  C'est le seul fichier qui mesure le SQL de la réinitialisation, et le seul où
  le lien est lu là où il arrive vraiment, dans un message. Ce qui ne s'y voit
  pas se mesure dans password-reset.spec.ts, en mémoire.

  Cinq choses ne peuvent se mesurer qu'ici :

  - le parcours complet, du formulaire au nouveau mot de passe ;
  - l'index unique partiel, sous deux demandes vraiment parallèles ;
  - la consommation conditionnelle, sous deux soumissions simultanées ;
  - la transaction qui ferme sessions et mémorisations, et qui **ne touche pas**
    la double authentification ;
  - l'écart de temps entre une adresse connue et une inconnue.

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
const NEW_PASSWORD = 'un mot de passe tout neuf';
const BASE_URL = 'https://mijote.local';

/** Un domaine réservé, qui n'existe nulle part. */
const USER_EMAIL = `oublieux-${randomUUID()}@exemple.test`;
const ADMIN_EMAIL = `admin-${randomUUID()}@exemple.test`;
const LOCKED_EMAIL = `bloque-${randomUUID()}@exemple.test`;
const RACED_EMAIL = `course-${randomUUID()}@exemple.test`;
const DEVICES_EMAIL = `appareils-${randomUUID()}@exemple.test`;
const TIMED_EMAIL = `mesure-${randomUUID()}@exemple.test`;
const PURGED_EMAIL = `purge-${randomUUID()}@exemple.test`;
const UNKNOWN_EMAIL = `personne-${randomUUID()}@exemple.test`;
/** Une adresse voisine, dont les compteurs ne doivent pas bouger. */
const NEIGHBOUR_EMAIL = `voisin-${randomUUID()}@exemple.test`;

const EMAILS = [
  USER_EMAIL,
  ADMIN_EMAIL,
  LOCKED_EMAIL,
  RACED_EMAIL,
  DEVICES_EMAIL,
  TIMED_EMAIL,
  PURGED_EMAIL,
  UNKNOWN_EMAIL,
  NEIGHBOUR_EMAIL,
];

/** Une IP par test : les deux limitations comptent par IP, et ne doivent pas se mêler. */
const IPS = {
  parcours: '203.0.113.20',
  dead: '203.0.113.21',
  admin: '203.0.113.22',
  locked: '203.0.113.23',
  raced: '203.0.113.24',
  devices: '203.0.113.25',
  timed: '203.0.113.26',
  purge: '203.0.113.27',
};

const UNUSABLE = "Ce lien n'est plus valable. Demandez une nouvelle réinitialisation.";

const ADMIN_SECRET = createTotpSecret();

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function probeDatabase(url: string): Promise<boolean> {
  const probe = createDatabase(url);

  try {
    // La table de la migration 0006 : une base non migrée vaut une base absente.
    await probe.execute(sql`select 1 from ${passwordReset} limit 1`);

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

const databaseReachable = DATABASE_URL === undefined ? false : await probeDatabase(DATABASE_URL);
const mailReachable = await probeMailpit();
const reachable = databaseReachable && mailReachable;

if (!reachable && process.env['CI'] === 'true') {
  throw new Error(
    `PostgreSQL (joignable : ${String(databaseReachable)}) ou Mailpit (joignable : ${String(mailReachable)}) manque alors que CI est posée : les services sont déclarés dans .github/workflows/ci.yml, et ce test ne doit pas se sauter en CI.`,
  );
}

let database: Database;
let app: NestExpressApplication;
let baseUrl: string;
let householdId: string;
const ids: Record<string, string> = {};

/** Ne supprime que les messages de ce test, pas la boîte de développement. */
async function deleteTestMessages(): Promise<void> {
  for (const email of EMAILS) {
    await fetch(`${MAILPIT_WEB}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, {
      method: 'DELETE',
    });
  }
}

/** Le lien d'une réinitialisation, tel qu'il arrive dans la boîte. */
const LINK_NEEDLE = `${BASE_URL}/mot-de-passe/reinitialisation#`;

/** Ce que dit la notification de changement, et elle seule. */
const CHANGED_NEEDLE = "vient d'être changé";

/**
 * Le texte du message reçu par cette adresse qui contient ce passage.
 *
 * Le passage est nécessaire : ce parcours envoie **deux** messages à la même
 * adresse, le lien puis la notification du changement, et prendre le dernier
 * arrivé revient à tirer au sort lequel des deux on lit.
 */
async function waitForMail(to: string, needle: string): Promise<string> {
  const query = encodeURIComponent(`to:${to}`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${MAILPIT_WEB}/api/v1/search?query=${query}`);
    const body: unknown = await response.json();
    const messages = isRecord(body) ? body['messages'] : undefined;
    // Annotée : `Array.isArray` sur une valeur inconnue rend un tableau de
    // `any`, que la règle no-unsafe-assignment refuse à juste titre.
    const summaries: unknown[] = Array.isArray(messages) ? messages : [];

    // Du plus récent au plus ancien, comme Mailpit les rend.
    for (const summary of summaries) {
      const id = isRecord(summary) ? summary['ID'] : undefined;

      if (typeof id === 'string') {
        const detail: unknown = await (await fetch(`${MAILPIT_WEB}/api/v1/message/${id}`)).json();
        const text = isRecord(detail) ? detail['Text'] : undefined;

        if (typeof text === 'string' && text.includes(needle)) {
          return text;
        }
      }
    }

    await wait(100);
  }

  throw new Error(`aucun message pour ${to} contenant « ${needle} » dans Mailpit`);
}

/**
 * Le jeton que porte le lien, pris dans le **fragment**.
 *
 * Que le test doive le lire là, et nulle part ailleurs, est précisément ce
 * qu'il mesure : un fragment n'est jamais envoyé au serveur (ADR 0014).
 */
function tokenInFragment(text: string): string {
  const found = new RegExp(`${BASE_URL}/mot-de-passe/reinitialisation#([A-Za-z0-9_-]+)`).exec(text);
  const token = found?.[1];

  if (token === undefined) {
    throw new Error(`aucun jeton dans le fragment du lien : ${text}`);
  }

  return token;
}

/**
 * Un POST sur une route publique de la réinitialisation.
 *
 * Aucun jeton CSRF : les deux routes en sont exemptées, aucune session ne les
 * précédant. L'origine et le type de média, eux, sont bien là.
 */
async function postPublic(path: string, body: unknown, ip: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

async function forgot(email: string, ip: string): Promise<Response> {
  return postPublic('/auth/password/forgot', { email }, ip);
}

async function reset(token: string, password: string, ip: string): Promise<Response> {
  return postPublic('/auth/password/reset', { token, password }, ip);
}

async function login(
  body: { email: string; password: string; remember?: boolean },
  ip: string,
): Promise<Response> {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl, 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
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

/** Crée un compte de test, et rend son identifiant. */
async function createAccount(email: string, role: 'user' | 'admin' = 'user'): Promise<string> {
  const [created] = await database
    .insert(account)
    .values({ householdId, email, passwordHash: await hashPassword(PASSWORD), role })
    .returning({ id: account.id });

  return created?.id ?? '';
}

/** Les jetons de ce compte, du plus récent au plus ancien. */
async function resetsOf(accountId: string): Promise<(typeof passwordReset.$inferSelect)[]> {
  return database
    .select()
    .from(passwordReset)
    .where(eq(passwordReset.accountId, accountId))
    .orderBy(sql`${passwordReset.createdAt} desc`);
}

/** Le jeton vivant du compte, attendu jusqu'à ce que le travail détaché ait écrit. */
async function waitForLiveReset(accountId: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [live] = await database
      .select({ id: passwordReset.id })
      .from(passwordReset)
      .where(
        and(
          eq(passwordReset.accountId, accountId),
          sql`${passwordReset.usedAt} is null and ${passwordReset.revokedAt} is null`,
        ),
      );

    if (live !== undefined) {
      return live.id;
    }

    await wait(50);
  }

  throw new Error('aucun jeton vivant écrit par le travail détaché');
}

/** La médiane d'une série, qui résiste à une mesure aberrante. */
function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted[middle] ?? 0;
}

describe.skipIf(!reachable)('la réinitialisation, contre une vraie base', () => {
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

    ids['user'] = await createAccount(USER_EMAIL);
    ids['admin'] = await createAccount(ADMIN_EMAIL, 'admin');
    ids['locked'] = await createAccount(LOCKED_EMAIL);
    ids['raced'] = await createAccount(RACED_EMAIL);
    ids['devices'] = await createAccount(DEVICES_EMAIL);
    ids['timed'] = await createAccount(TIMED_EMAIL);
    ids['purged'] = await createAccount(PURGED_EMAIL);
    ids['neighbour'] = await createAccount(NEIGHBOUR_EMAIL);

    /*
      L'administrateur a sa double authentification active, avec un code de
      secours : c'est ce qui permet de vérifier qu'une réinitialisation n'y
      touche pas.
    */
    await database.insert(accountTwoFactor).values({
      accountId: ids['admin'],
      secretCipher: encrypt(readEncryptionKey(process.env), ids['admin'] ?? '', ADMIN_SECRET),
      activatedAt: new Date(),
    });
    await database.insert(twoFactorBackupCode).values({
      accountId: ids['admin'],
      position: 1,
      codeHash: await hashPassword('1-ABCD-EFGH-JKLM'),
    });

    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    app.set('trust proxy', resolveTrustProxy(process.env));

    await app.listen(0);

    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    // Le foyer emporte en cascade ses comptes, leurs sessions et leurs jetons.
    await database.delete(household).where(eq(household.id, householdId));

    const pepper = readPepper(process.env);

    for (const value of [...EMAILS, ...Object.values(IPS)]) {
      const print = fingerprint(pepper, value);

      await database.delete(loginAttempt).where(eq(loginAttempt.emailFingerprint, print));
      await database.delete(loginAttempt).where(eq(loginAttempt.ipFingerprint, print));
    }

    await app.close();
    await database.$client.end();
  });

  describe('le parcours complet', () => {
    it('va du formulaire au nouveau mot de passe', async () => {
      const demanded = await forgot(USER_EMAIL, IPS.parcours);

      expect(demanded.status).toBe(202);
      // Le corps reçu porte une adresse : rien n'a à en garder une copie.
      expect(demanded.headers.get('cache-control')).toBe('no-store');
      expect(await demanded.text()).toBe('');

      const token = tokenInFragment(await waitForMail(USER_EMAIL, LINK_NEEDLE));
      const [row] = await resetsOf(ids['user'] ?? '');

      // Le jeton n'est en base que haché : une fuite de la table ne donne aucun
      // lien utilisable.
      expect(row?.tokenHash).toBe(hashSecret(token));
      expect(JSON.stringify(row)).not.toContain(token);
      // Une heure, pas plus.
      expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60 * 1000 + 5_000);

      const done = await reset(token, NEW_PASSWORD, IPS.parcours);

      expect(done.status).toBe(204);
      // Aucune session ouverte : l'écran renvoie vers la connexion (ADR 0014).
      expect(done.headers.getSetCookie()).toEqual([]);

      const withNew = await login({ email: USER_EMAIL, password: NEW_PASSWORD }, IPS.parcours);

      expect(withNew.status).toBe(200);
      expect(sessionResponseSchema.parse(await withNew.json()).account.email).toBe(USER_EMAIL);

      const withOld = await login({ email: USER_EMAIL, password: PASSWORD }, IPS.parcours);

      expect(withOld.status).toBe(401);
    });

    it('prévient le titulaire que son mot de passe a changé', async () => {
      /*
        Le second message de ce parcours, parti détaché après la réponse : c'est
        la seule chose qui avertit le titulaire légitime quand ce n'était pas
        lui.
      */
      const text = await waitForMail(USER_EMAIL, CHANGED_NEEDLE);

      expect(text).toContain("Si ce n'était pas vous");
      // Aucun lien : ce serait le support rêvé d'un hameçonnage.
      expect(text).not.toMatch(/https?:\/\//);
    });

    it('refuse le lien qui vient de servir, et tous les autres liens morts', async () => {
      const token = tokenInFragment(await waitForMail(USER_EMAIL, LINK_NEEDLE));

      /*
        Quatre cas, un seul refus : déjà utilisé, inconnu, expiré, révoqué. Les
        distinguer dirait à qui a trouvé un vieux lien que sa cible s'en est
        servie.
      */
      const expired = 'un-jeton-expire';
      const revoked = 'un-jeton-revoque';

      await database.insert(passwordReset).values([
        {
          accountId: ids['user'] ?? '',
          tokenHash: hashSecret(expired),
          expiresAt: new Date(Date.now() - 1_000),
        },
        {
          accountId: ids['user'] ?? '',
          tokenHash: hashSecret(revoked),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date(),
        },
      ]);

      for (const candidate of [token, 'un-jeton-inconnu', expired, revoked]) {
        const refused = await reset(candidate, NEW_PASSWORD, IPS.dead);
        const problem = problemDetailsSchema.parse(await refused.json());

        expect(refused.status, candidate).toBe(410);
        expect(problem.detail, candidate).toBe(UNUSABLE);
      }
    });
  });

  describe("l'absence d'oracle", () => {
    it('répond la même chose pour une adresse sans compte', async () => {
      const known = await forgot(TIMED_EMAIL, IPS.timed);
      const unknown = await forgot(UNKNOWN_EMAIL, IPS.timed);

      expect(unknown.status).toBe(known.status);
      expect(await unknown.text()).toBe(await known.text());
      expect(unknown.headers.get('cache-control')).toBe(known.headers.get('cache-control'));
    });

    it('répond dans le même temps, à une adresse connue et à une inconnue', async () => {
      /*
        La garantie est structurelle : la réponse ne dépend d'aucun travail qui
        dépend du compte, et l'envoi part détaché. Cette mesure la confirme,
        elle ne la tient pas : c'est le test de l'envoyeur bloquant, dans
        password-reset.spec.ts, qui la tient.

        Les mesures alternent, pour qu'une dérive de charge touche les deux
        séries de la même façon. La borne est large exprès : ce qu'elle doit
        attraper est un envoi SMTP attendu, qui coûte des dizaines de
        millisecondes au mieux et dix secondes au pire, pas une différence de
        quelques millisecondes qui ne dit rien de personne.

        Relevés le 9 novembre 2026 sur le poste de développement, neuf mesures
        par série, trois exécutions : 15,0 contre 12,8 ms, 20,5 contre 17,8 ms,
        17,4 contre 15,1 ms. L'écart tient dans deux à trois millisecondes, et
        il est du côté de l'adresse connue, dont le travail détaché occupe la
        base pendant les mesures suivantes. Un envoi SMTP attendu se compterait,
        lui, en dizaines de millisecondes au mieux.
      */
      const pepper = readPepper(process.env);
      const samples = 9;
      const withAccount: number[] = [];
      const without: number[] = [];

      for (let round = 0; round < samples; round += 1) {
        for (const [email, series] of [
          [TIMED_EMAIL, withAccount],
          [UNKNOWN_EMAIL, without],
        ] as const) {
          const started = performance.now();

          await forgot(email, IPS.timed);

          series.push(performance.now() - started);
        }

        /*
          Le test efface le compteur qu'il vient de remplir : sans cela la
          limitation refuserait la quatrième mesure, et ces refus n'auraient
          plus rien à voir avec le temps qu'on mesure.
        */
        for (const value of [TIMED_EMAIL, UNKNOWN_EMAIL, IPS.timed]) {
          const print = fingerprint(pepper, value);

          await database
            .delete(loginAttempt)
            .where(
              and(
                eq(loginAttempt.purpose, 'reset_request'),
                sql`(${loginAttempt.emailFingerprint} = ${print} or ${loginAttempt.ipFingerprint} = ${print})`,
              ),
            );
        }
      }

      expect(Math.abs(median(withAccount) - median(without))).toBeLessThan(300);
    });
  });

  describe('deux demandes à la fois', () => {
    it("n'en laisse vivre qu'une, sans erreur", async () => {
      /*
        Les deux travaux détachés tournent en parallèle : ou bien les deux
        transactions se chevauchent, et l'index unique partiel en fait perdre
        une, ou bien elles se suivent, et la seconde révoque la première. Dans
        les deux cas, un seul jeton vivant, et aucune erreur non gérée
        (ADR 0014).
      */
      const [first, second] = await Promise.all([
        forgot(RACED_EMAIL, IPS.raced),
        forgot(RACED_EMAIL, IPS.raced),
      ]);

      expect(first.status).toBe(202);
      expect(second.status).toBe(202);

      await waitForLiveReset(ids['raced'] ?? '');
      // Le temps que le second travail finisse, s'il n'a pas déjà fini.
      await wait(500);

      const rows = await resetsOf(ids['raced'] ?? '');
      const live = rows.filter((row) => row.usedAt === null && row.revokedAt === null);

      expect(live).toHaveLength(1);
      expect(rows.length).toBeLessThanOrEqual(2);

      // Et le lien qui est arrivé marche, ce qui est le seul point de vue qui
      // compte pour la personne.
      const token = tokenInFragment(await waitForMail(RACED_EMAIL, LINK_NEEDLE));
      const done = await reset(token, NEW_PASSWORD, IPS.raced);

      expect([204, 410]).toContain(done.status);
    });

    it("ne laisse passer qu'une seule soumission du même lien", async () => {
      const token = 'un-jeton-pour-deux-soumissions';

      await database.insert(passwordReset).values({
        accountId: ids['raced'] ?? '',
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 60_000),
      });

      /*
        L'écriture conditionnelle est ce qui tranche : la seconde ne modifie
        aucune ligne, et elle est refusée. Sans elle, on ne saurait pas lequel
        des deux mots de passe a gagné.
      */
      const [one, two] = await Promise.all([
        reset(token, 'le premier mot de passe', IPS.raced),
        reset(token, 'le second mot de passe', IPS.raced),
      ]);

      expect([one.status, two.status].sort()).toEqual([204, 410]);
    });
  });

  describe('ce que la réinitialisation ferme', () => {
    it('ferme toutes les sessions et toutes les mémorisations du compte', async () => {
      const token = 'un-jeton-pour-deux-appareils';

      // Deux appareils connectés, chacun avec sa mémorisation.
      const devices = await Promise.all([
        login({ email: DEVICES_EMAIL, password: PASSWORD, remember: true }, IPS.devices),
        login({ email: DEVICES_EMAIL, password: PASSWORD, remember: true }, IPS.devices),
      ]);

      for (const device of devices) {
        expect(device.status).toBe(200);
      }

      const kept = cookieValue(devices[0] ?? new Response(), 'mijote_session');
      const accountId = ids['devices'] ?? '';

      expect(
        await database.select().from(session).where(eq(session.accountId, accountId)),
      ).toHaveLength(2);
      expect(
        await database.select().from(rememberToken).where(eq(rememberToken.accountId, accountId)),
      ).toHaveLength(2);

      await database.insert(passwordReset).values({
        accountId,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect((await reset(token, NEW_PASSWORD, IPS.devices)).status).toBe(204);

      expect(await database.select().from(session).where(eq(session.accountId, accountId))).toEqual(
        [],
      );
      expect(
        await database.select().from(rememberToken).where(eq(rememberToken.accountId, accountId)),
      ).toEqual([]);

      /*
        Et le cookie que le navigateur garde ne vaut plus rien : c'est le point
        de vue qui compte, on réinitialise souvent en soupçonnant un vol.
      */
      const stale = await fetch(`${baseUrl}/auth/session`, {
        headers: { cookie: `mijote_session=${kept ?? ''}`, origin: baseUrl },
      });

      expect(stale.status).toBe(401);
    });

    it('efface les échecs de connexion comptés sur son adresse, et seulement eux', async () => {
      const pepper = readPepper(process.env);
      const print = fingerprint(pepper, LOCKED_EMAIL);
      const neighbour = fingerprint(pepper, NEIGHBOUR_EMAIL);
      const token = 'un-jeton-pour-un-compte-bloque';

      // Cinq mots de passe faux : le compte est bloqué pour un quart d'heure.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login({ email: LOCKED_EMAIL, password: 'pas le bon mot de passe' }, IPS.locked);
      }

      expect((await login({ email: LOCKED_EMAIL, password: PASSWORD }, IPS.locked)).status).toBe(
        429,
      );

      // Le voisin, lui, n'a rien à voir là-dedans, et ses échecs doivent rester.
      await login({ email: NEIGHBOUR_EMAIL, password: 'pas le bon mot de passe' }, IPS.locked);
      // Un échec de code sur la même adresse : il protège le second facteur, et
      // cette story n'y touche pas.
      await database.insert(loginAttempt).values({
        emailFingerprint: print,
        ipFingerprint: print,
        outcome: 'failed',
        purpose: 'code',
      });

      await database.insert(passwordReset).values({
        accountId: ids['locked'] ?? '',
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect((await reset(token, NEW_PASSWORD, IPS.locked)).status).toBe(204);

      /*
        Sans cet effacement, la personne qui s'est trompée cinq fois avant de
        réinitialiser resterait bloquée avec son mot de passe tout neuf
        (ADR 0014).
      */
      const after = await login({ email: LOCKED_EMAIL, password: NEW_PASSWORD }, IPS.locked);

      expect(after.status).toBe(200);

      const remaining = await database
        .select()
        .from(loginAttempt)
        .where(and(eq(loginAttempt.emailFingerprint, print), eq(loginAttempt.outcome, 'failed')));

      // Les `password` sont partis, le `code` est resté.
      expect(remaining.map((row) => row.purpose)).toEqual(['code']);
      expect(
        await database
          .select()
          .from(loginAttempt)
          .where(
            and(eq(loginAttempt.emailFingerprint, neighbour), eq(loginAttempt.outcome, 'failed')),
          ),
      ).toHaveLength(1);
    });

    it("ne touche pas la double authentification, ni les droits d'administration", async () => {
      const token = 'un-jeton-pour-un-administrateur';
      const accountId = ids['admin'] ?? '';

      await database.insert(passwordReset).values({
        accountId,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect((await reset(token, NEW_PASSWORD, IPS.admin)).status).toBe(204);

      // La ligne du second facteur est intacte, et ses codes de secours aussi.
      const [factor] = await database
        .select()
        .from(accountTwoFactor)
        .where(eq(accountTwoFactor.accountId, accountId));

      expect(factor?.activatedAt).not.toBeNull();
      expect(
        await database
          .select()
          .from(twoFactorBackupCode)
          .where(eq(twoFactorBackupCode.accountId, accountId)),
      ).toHaveLength(1);

      /*
        Et surtout : le nouveau mot de passe ne suffit pas à entrer. La
        connexion réclame le code, comme avant, donc réinitialiser son mot de
        passe ne contourne pas le second facteur (ADR 0014).
      */
      const withNew = await login({ email: ADMIN_EMAIL, password: NEW_PASSWORD }, IPS.admin);

      expect(withNew.status).toBe(200);
      expect(loginResponseSchema.parse(await withNew.json())).toEqual({ twoFactorRequired: true });
      expect(cookieValue(withNew, 'mijote_session')).toBeUndefined();
    });
  });

  describe('la purge', () => {
    it('efface les jetons expirés à la connexion suivante', async () => {
      /*
        Un compte à lui : l'index unique partiel ne regarde pas l'expiration,
        donc un jeton périmé mais non révoqué occupe encore la place, et les
        comptes des autres tests en ont déjà un (ADR 0014).
      */
      const accountId = ids['purged'] ?? '';

      await database.insert(passwordReset).values({
        accountId,
        tokenHash: hashSecret('un-jeton-perime'),
        expiresAt: new Date(Date.now() - 60_000),
      });

      /*
        La purge est accrochée à une connexion réussie, comme celle des
        sessions, des mémorisations et des tentatives (ADR 0010) : pas
        d'ordonnanceur, et rien qu'un inconnu puisse déclencher.
      */
      expect((await login({ email: PURGED_EMAIL, password: PASSWORD }, IPS.purge)).status).toBe(
        200,
      );

      const rows = await resetsOf(accountId);

      expect(rows.some((row) => row.expiresAt.getTime() < Date.now())).toBe(false);
    });
  });
});
