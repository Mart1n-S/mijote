import {
  accountDeletionStateSchema,
  accountExportSchema,
  CSRF_COOKIE,
  CSRF_HEADER,
  problemDetailsSchema,
} from '@mijote/shared';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { createDatabase, type Database } from '../db/client.js';
import {
  account,
  accountTwoFactor,
  household,
  invitation,
  loginAttempt,
  passwordReset,
  pendingLogin,
  rememberToken,
  session,
  twoFactorBackupCode,
} from '../db/schema.js';
import { loadEnvFile } from '../env.js';
import { encrypt, readEncryptionKey } from '../security/encryption.js';
import { hashPassword } from '../security/passwords.js';
import { fingerprint, readPepper } from '../security/pepper.js';
import { hashSecret } from '../security/tokens.js';
import { formatBackupCode } from '../security/backup-codes.js';
import { createTotpSecret, stepAt, totpCode } from '../security/totp.js';
import { resolveTrustProxy } from '../security/trust-proxy.js';

/*
  L'export et la suppression contre une vraie base.

  C'est le seul fichier qui peut répondre à la question qui compte : **après une
  suppression, reste-t-il quelque chose ?** Il interroge chaque table une par
  une.

  Ce qu'il **ne** mesure pas : le refus du dernier administrateur, qui est une
  propriété globale à une base que les fichiers parallèles partagent. Il est
  mesuré dans privacy.service.spec.ts, et le test « supprime un administrateur
  quand il en reste un autre » dit pourquoi en détail.

  Hors CI, il se saute quand PostgreSQL n'est pas joignable. **En CI, il ne se
  saute jamais.**
*/

loadEnvFile();

const DATABASE_URL = process.env['DATABASE_URL'];
const PASSWORD = 'un mot de passe assez long';

/** Celui qui se supprime, avec tout ce qu'un compte peut porter. */
const FULL_EMAIL = `complet-${randomUUID()}@exemple.test`;
/** Celui qu'il a invité : son invitation doit survivre à la suppression. */
const GUEST_EMAIL = `invite-${randomUUID()}@exemple.test`;
/** Deux administrateurs, pour le refus du dernier. */
const ADMIN_EMAIL = `admin-${randomUUID()}@exemple.test`;
const SECOND_ADMIN_EMAIL = `admin2-${randomUUID()}@exemple.test`;
/** Un compte ordinaire, pour l'export et les refus de confirmation. */
const PLAIN_EMAIL = `simple-${randomUUID()}@exemple.test`;
/** Quelqu'un que l'administrateur a invité : son adresse ne doit pas sortir. */
const SENT_EMAIL = `destinataire-${randomUUID()}@exemple.test`;

const EMAILS = [FULL_EMAIL, GUEST_EMAIL, ADMIN_EMAIL, SECOND_ADMIN_EMAIL, PLAIN_EMAIL, SENT_EMAIL];

const IPS = {
  full: '203.0.113.60',
  admin: '203.0.113.61',
  second: '203.0.113.62',
  plain: '203.0.113.63',
};

const ADMIN_SECRET = createTotpSecret();

/*
  Les confirmations de suppression passent par des **codes de secours** et non
  par des codes TOTP.

  La raison est le rejeu, et elle est voulue : un code TOTP ne vaut qu'une fois
  dans sa fenêtre de trente secondes (ADR 0012), et la connexion d'un
  administrateur en consomme déjà un. Les codes suivants d'une même fenêtre
  seraient refusés, et ceux de la fenêtre d'apres tombent hors tolérance. Un
  code de secours, lui, est à usage unique par construction : c'est exactement
  ce qu'il faut pour confirmer plusieurs suppressions dans un même test.
*/
const BACKUP_SECRETS = ['AAAABBBBCCCC'];

/**
 * Le code tel qu'on le recopie, pour un de ces secrets.
 *
 * Par la fonction du projet et non par une chaîne écrite à la main : **seules
 * les douze lettres sont hachées**, le numéro étant porte en clair, et un
 * libellé recopié ici pourrait dériver du format reel.
 */
function backupCode(index: number): string {
  return formatBackupCode(index + 1, BACKUP_SECRETS[index] ?? '');
}

async function probeDatabase(url: string): Promise<boolean> {
  const probe = createDatabase(url);

  try {
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

interface Tenant {
  householdId: string;
  accountId: string;
  email: string;
  cookie: string;
  csrf: string;
  ip: string;
}

let full: Tenant;
let admin: Tenant;
let plain: Tenant;

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
async function createTenant(
  email: string,
  ip: string,
  role: 'user' | 'admin' = 'user',
): Promise<Tenant> {
  const [createdHousehold] = await database
    .insert(household)
    .values({ name: `Foyer de ${email}` })
    .returning({ id: household.id });

  const householdId = createdHousehold?.id ?? '';
  const [createdAccount] = await database
    .insert(account)
    .values({ householdId, email, passwordHash: await hashPassword(PASSWORD), role })
    .returning({ id: account.id });

  const accountId = createdAccount?.id ?? '';

  if (role === 'admin') {
    /*
      Un administrateur a toujours son second facteur dans ce lot : c'est ce qui
      permet de vérifier que la suppression le réclame (ADR 0012).
    */
    await database.insert(accountTwoFactor).values({
      accountId,
      secretCipher: encrypt(readEncryptionKey(process.env), accountId, ADMIN_SECRET),
      activatedAt: new Date(),
    });

    /*
      Un seul code de secours, et non dix : chacun coûte un hachage Argon2id de
      64 Mio dans un crochet déjà chargé (ADR 0011), et une seule confirmation
      en a besoin ici.
    */
    await database.insert(twoFactorBackupCode).values(
      await Promise.all(
        BACKUP_SECRETS.map(async (secret, index) => ({
          accountId,
          position: index + 1,
          codeHash: await hashPassword(secret),
        })),
      ),
    );
  }

  const opened = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseUrl, 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: PASSWORD, remember: true }),
  });

  if (opened.status !== 200) {
    throw new Error(`la session de ${email} ne s'est pas ouverte : ${String(opened.status)}`);
  }

  let csrf = cookieValue(opened, CSRF_COOKIE) ?? '';
  let sessionToken = cookieValue(opened, 'mijote_session');

  if (role === 'admin') {
    // Le mot de passe ne suffit pas : la session s'ouvre après le code.
    const verified = await fetch(`${baseUrl}/auth/two-factor`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: `mijote_pending=${cookieValue(opened, 'mijote_pending') ?? ''}; ${CSRF_COOKIE}=${csrf}`,
        [CSRF_HEADER]: csrf,
        'x-forwarded-for': ip,
      },
      body: JSON.stringify({ code: totpCode(ADMIN_SECRET, stepAt(new Date())) }),
    });

    if (verified.status !== 200) {
      throw new Error(`le second facteur de ${email} a échoué : ${String(verified.status)}`);
    }

    csrf = cookieValue(verified, CSRF_COOKIE) ?? '';
    sessionToken = cookieValue(verified, 'mijote_session');
  }

  return {
    householdId,
    accountId,
    email,
    csrf,
    ip,
    cookie: `mijote_session=${sessionToken ?? ''}; ${CSRF_COOKIE}=${csrf}`,
  };
}

/**
 * Demande l'export, comme le front le fait.
 *
 * Un `POST`, donc les trois barrières CSRF s'appliquent : type de média,
 * origine et jeton. C'est le prix d'une route qui ne doit pas pouvoir être
 * déclenchée par une page tierce (ADR 0017).
 */
async function exportOf(tenant: Tenant): Promise<Response> {
  return fetch(`${baseUrl}/account/export`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      cookie: tenant.cookie,
      [CSRF_HEADER]: tenant.csrf,
      'x-forwarded-for': tenant.ip,
    },
  });
}

async function deleteAccount(tenant: Tenant, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/account/delete`, {
    method: 'POST',
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

/** Combien de lignes restent, table par table, pour ce compte et son foyer. */
async function remainingFor(tenant: Tenant): Promise<Record<string, number>> {
  const pepper = readPepper(process.env);
  const counts: Record<string, number> = {};

  counts['household'] = (
    await database.select().from(household).where(eq(household.id, tenant.householdId))
  ).length;
  counts['account'] = (
    await database.select().from(account).where(eq(account.id, tenant.accountId))
  ).length;
  counts['session'] = (
    await database.select().from(session).where(eq(session.accountId, tenant.accountId))
  ).length;
  counts['remember_token'] = (
    await database.select().from(rememberToken).where(eq(rememberToken.accountId, tenant.accountId))
  ).length;
  counts['pending_login'] = (
    await database.select().from(pendingLogin).where(eq(pendingLogin.accountId, tenant.accountId))
  ).length;
  counts['account_two_factor'] = (
    await database
      .select()
      .from(accountTwoFactor)
      .where(eq(accountTwoFactor.accountId, tenant.accountId))
  ).length;
  counts['two_factor_backup_code'] = (
    await database
      .select()
      .from(twoFactorBackupCode)
      .where(eq(twoFactorBackupCode.accountId, tenant.accountId))
  ).length;
  counts['password_reset'] = (
    await database.select().from(passwordReset).where(eq(passwordReset.accountId, tenant.accountId))
  ).length;
  counts['invitation'] = (
    await database.select().from(invitation).where(eq(invitation.email, tenant.email))
  ).length;
  counts['login_attempt_email'] = (
    await database
      .select()
      .from(loginAttempt)
      .where(eq(loginAttempt.emailFingerprint, fingerprint(pepper, tenant.email)))
  ).length;
  counts['login_attempt_account'] = (
    await database
      .select()
      .from(loginAttempt)
      .where(eq(loginAttempt.emailFingerprint, fingerprint(pepper, tenant.accountId)))
  ).length;

  return counts;
}

describe.skipIf(!reachable)("l'export et la suppression, contre une vraie base", () => {
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

    full = await createTenant(FULL_EMAIL, IPS.full);
    admin = await createTenant(ADMIN_EMAIL, IPS.admin, 'admin');
    plain = await createTenant(PLAIN_EMAIL, IPS.plain);
  });

  afterAll(async () => {
    const pepper = readPepper(process.env);

    for (const email of EMAILS) {
      const rows = await database
        .select({ householdId: account.householdId })
        .from(account)
        .where(eq(account.email, email));

      for (const row of rows) {
        await database.delete(household).where(eq(household.id, row.householdId));
      }

      await database.delete(invitation).where(eq(invitation.email, email));
      await database
        .delete(loginAttempt)
        .where(eq(loginAttempt.emailFingerprint, fingerprint(pepper, email)));
    }

    for (const ip of Object.values(IPS)) {
      await database
        .delete(loginAttempt)
        .where(eq(loginAttempt.ipFingerprint, fingerprint(pepper, ip)));
    }

    await app.close();
    await database.$client.end();
  });

  describe("l'export", () => {
    it('rend tout le compte et tout le foyer, en pièce jointe et sans copie', async () => {
      const response = await exportOf(plain);

      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-disposition')).toMatch(
        /^attachment; filename="mijote-mes-donnees-\d{4}-\d{2}-\d{2}\.json"$/,
      );

      // La forme du fichier est celle du schéma partagé, et il la vérifie.
      const exported = accountExportSchema.parse(await response.json());

      expect(exported.account.email).toBe(PLAIN_EMAIL);
      expect(exported.household.profile.varietyBalance).toBe('reuse');
      // La session et la mémorisation ouvertes par la connexion sont décrites.
      expect(exported.devices.sessions).toHaveLength(1);
      expect(exported.devices.remembered).toHaveLength(1);
    });

    it('ne laisse sortir aucun secret ni aucune empreinte', async () => {
      /*
        La règle de l'ADR 0017, mesurée sur le fichier produit : rien de ce qui
        sert à s'authentifier ne sort, même sous forme d'empreinte.
      */
      const raw = await (await exportOf(admin)).text();

      expect(raw).not.toContain('$argon2id$');
      expect(raw).not.toContain(ADMIN_SECRET);
      expect(raw).not.toContain('v1.');

      const [row] = await database
        .select({ cipher: accountTwoFactor.secretCipher })
        .from(accountTwoFactor)
        .where(eq(accountTwoFactor.accountId, admin.accountId));

      expect(raw).not.toContain(row?.cipher ?? 'secret absent');

      const sessions = await database
        .select({ tokenHash: session.tokenHash })
        .from(session)
        .where(eq(session.accountId, admin.accountId));

      for (const session of sessions) {
        expect(raw).not.toContain(session.tokenHash);
      }
    });

    it("décrit le second facteur, et ne livre pas l'adresse d'un tiers", async () => {
      /*
        Deux garanties que le texte brut du test précédent ne peut pas donner :
        le contenu du bloc du second facteur, qu'une inversion de mappage
        casserait sans bruit, et l'absence de l'adresse de quelqu'un d'autre.

        L'invitation est posée ici et non dans le crochet : c'est ce test qui en
        a besoin, et le crochet en paie déjà assez.
      */
      await database.insert(invitation).values({
        email: SENT_EMAIL,
        tokenHash: hashSecret(`envoyee-par-admin-${randomUUID()}`),
        invitedBy: admin.accountId,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const response = await exportOf(admin);
      const exported = accountExportSchema.parse(await response.json());

      expect(exported.twoFactor.active).toBe(true);
      expect(exported.twoFactor.activatedAt).not.toBeNull();
      // Un seul code de secours est créé pour cet administrateur.
      expect(exported.twoFactor.backupCodeCount).toBe(1);
      expect(exported.twoFactor.usedBackupCodes).toEqual([]);

      // L'invitation qu'il a envoyée n'est pas la sienne : elle porte l'adresse
      // de quelqu'un qui n'a rien demandé (ADR 0017).
      expect(JSON.stringify(exported)).not.toContain(SENT_EMAIL);
    });

    it('ne rend rien sans session', async () => {
      const response = await fetch(`${baseUrl}/account/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseUrl },
      });

      // La garde de session refuse avant celle du jeton : sans session, il n'y
      // a de toute façon aucun secret CSRF à présenter.
      expect(response.status).toBe(401);
    });

    it('ne rend rien sans jeton CSRF, même avec une session valide', async () => {
      /*
        La raison d'être du `POST` : une page tierce ne peut ni lire le cookie
        du jeton, ni écrire cet en-tête. Sans lui, la requête est refusée avant
        d'atteindre le service, donc aucun fichier ne part (ADR 0010, ADR 0017).
      */
      const response = await fetch(`${baseUrl}/account/export`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseUrl,
          cookie: plain.cookie,
          'x-forwarded-for': plain.ip,
        },
      });
      const problem = problemDetailsSchema.parse(await response.json());

      expect(response.status).toBe(403);
      expect(problem.detail).toBe('Jeton de protection manquant ou invalide.');
    });

    it("ne rend rien à une origine qui n'est pas la nôtre", async () => {
      const response = await fetch(`${baseUrl}/account/export`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://ailleurs.example',
          cookie: plain.cookie,
          [CSRF_HEADER]: plain.csrf,
          'x-forwarded-for': plain.ip,
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("l'état de la suppression", () => {
    it("l'ouvre à un compte ordinaire, et la ferme à personne sans session", async () => {
      const state = await fetch(`${baseUrl}/account/deletion`, {
        headers: { origin: baseUrl, cookie: plain.cookie },
      });

      expect(accountDeletionStateSchema.parse(await state.json())).toEqual({ blocked: false });
      // Un état propre à un compte : aucune copie en cache, comme les deux
      // autres routes du module.
      expect(state.headers.get('cache-control')).toBe('no-store');

      const anonymous = await fetch(`${baseUrl}/account/deletion`, {
        headers: { origin: baseUrl },
      });

      expect(anonymous.status).toBe(401);
    });
  });

  describe('la suppression', () => {
    it('refuse sans mot de passe, sans confirmation, et avec un mot de passe faux', async () => {
      expect((await deleteAccount(plain, { confirmed: true })).status).toBe(400);
      expect((await deleteAccount(plain, { password: PASSWORD })).status).toBe(400);
      expect(
        (await deleteAccount(plain, { password: 'pas le bon mot de passe', confirmed: true }))
          .status,
      ).toBe(401);
    });

    it('exige le code quand le second facteur est actif', async () => {
      const refused = await deleteAccount(admin, { password: PASSWORD, confirmed: true });
      const problem = problemDetailsSchema.parse(await refused.json());

      expect(refused.status).toBe(401);
      expect(problem.detail).toMatch(/code/i);
    });

    it('supprime un administrateur quand il en reste un autre', async () => {
      /*
        Le refus du **dernier** administrateur ne se mesure pas ici, et c'est
        une limite de ce fichier, pas du code : la propriété est globale à la
        base, et cette base est partagée par les fichiers de test qui tournent
        en parallèle, chacun créant ses propres administrateurs. Au moment où ce
        test passe, la base en compte une dizaine.

        Le refus et le verrou qui le sérialise sont donc mesurés dans
        privacy.service.spec.ts, sur un magasin en mémoire où le compte est
        connu. Ce qui se mesure ici est l'autre face : avec un second
        administrateur, la suppression passe, et il en reste un.
      */
      const second = await createTenant(SECOND_ADMIN_EMAIL, IPS.second, 'admin');
      const deleted = await deleteAccount(second, {
        password: PASSWORD,
        code: backupCode(0),
        confirmed: true,
      });

      expect(deleted.status).toBe(204);
      expect((await remainingFor(second))['account']).toBe(0);
      // Celui du test, lui, est toujours là.
      expect((await remainingFor(admin))['account']).toBe(1);
    });

    it('ne laisse rien derrière elle, table par table', async () => {
      /*
        Le test qui porte toute la story : on remplit tout ce qu'un compte peut
        porter, puis on vérifie table par table qu'il ne reste rien.
      */
      await database.insert(pendingLogin).values({
        accountId: full.accountId,
        tokenHash: hashSecret(`attente-${randomUUID()}`),
        csrfSecret: 'peu importe',
        expiresAt: new Date(Date.now() + 60_000),
      });
      await database.insert(passwordReset).values({
        accountId: full.accountId,
        tokenHash: hashSecret(`reinitialisation-${randomUUID()}`),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await database.insert(accountTwoFactor).values({
        accountId: full.accountId,
        secretCipher: encrypt(readEncryptionKey(process.env), full.accountId, createTotpSecret()),
        activatedAt: null,
      });
      await database.insert(twoFactorBackupCode).values({
        accountId: full.accountId,
        position: 1,
        codeHash: await hashPassword('1-ABCD-EFGH-JKLM'),
      });
      // Une invitation qui lui est adressée, et une qu'il a envoyée.
      await database.insert(invitation).values([
        {
          email: full.email,
          tokenHash: hashSecret(`recue-${randomUUID()}`),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: new Date(),
        },
        {
          email: GUEST_EMAIL,
          tokenHash: hashSecret(`envoyee-${randomUUID()}`),
          invitedBy: full.accountId,
          expiresAt: new Date(Date.now() + 60_000),
        },
      ]);
      // Un échec de connexion, qui a laissé une empreinte de son adresse.
      await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: baseUrl,
          'x-forwarded-for': IPS.full,
        },
        body: JSON.stringify({ email: full.email, password: 'pas le bon' }),
      });

      const before = await remainingFor(full);

      expect(before['account']).toBe(1);
      expect(before['login_attempt_email']).toBeGreaterThan(0);

      const deleted = await deleteAccount(full, { password: PASSWORD, confirmed: true });

      expect(deleted.status).toBe(204);
      /*
        Les quatre cookies partent expirés, comme à la déconnexion : la session,
        la mémorisation, l'attente de code et le jeton CSRF lisible
        (`clearedCookies`).
      */
      expect(deleted.headers.getSetCookie()).toHaveLength(4);

      for (const header of deleted.headers.getSetCookie()) {
        expect(header).toContain('Max-Age=0');
      }

      expect(await remainingFor(full)).toEqual({
        household: 0,
        account: 0,
        session: 0,
        remember_token: 0,
        pending_login: 0,
        account_two_factor: 0,
        two_factor_backup_code: 0,
        password_reset: 0,
        invitation: 0,
        login_attempt_email: 0,
        login_attempt_account: 0,
      });

      /*
        L'invitation qu'il avait envoyée reste, orpheline : elle porte l'adresse
        de quelqu'un d'autre, qui n'a rien demandé (ADR 0017).
      */
      const [guest] = await database
        .select({ invitedBy: invitation.invitedBy })
        .from(invitation)
        .where(eq(invitation.email, GUEST_EMAIL));

      expect(guest).toBeDefined();
      expect(guest?.invitedBy).toBeNull();
    });

    it('ferme la session du navigateur qui vient de supprimer, juste avant', async () => {
      // La suite du test précédent, et il n'y a pas de suppression à refaire :
      // c'est la session de `full`, supprimée là, qu'on interroge ici.
      const response = await fetch(`${baseUrl}/auth/session`, {
        headers: { origin: baseUrl, cookie: full.cookie },
      });

      expect(response.status).toBe(401);
    });
  });
});
