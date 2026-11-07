import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../security/passwords.js';

import { AttemptsService, type AttemptStore } from './attempts.service.js';
import { REMEMBER_TTL_MS } from './auth.cookies.js';
import type { AuthLog } from './auth.log.js';
import type {
  AccountRecord,
  LoginOutcome,
  RememberRecord,
  SessionRecord,
} from './auth.repository.js';
import { type AccountStore, AuthService } from './auth.service.js';
import { RememberService, type RememberStore } from './remember.service.js';
import { SessionService, type SessionStore } from './session.service.js';

/*
  La connexion de bout en bout, sans HTTP et sans PostgreSQL : les vrais
  services, branchés sur des tables en mémoire. C'est ici que se mesurent le
  message unique, la limitation, les cookies posés, et ce que les journaux
  n'écrivent pas.
*/

const PEPPER = Buffer.alloc(32).toString('base64');

const PASSWORD = 'un mot de passe assez long';
const EMAIL = 'martin@exemple.test';
const IP = '203.0.113.7';

const ACCOUNT: AccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  email: EMAIL,
  passwordHash: '',
  role: 'user',
};

/** Le seul message d'échec, celui que les deux cas doivent partager. */
const INVALID_CREDENTIALS = 'Adresse e-mail ou mot de passe incorrect.';

class MemoryAccounts implements AccountStore {
  readonly rows = new Map<string, AccountRecord>();

  findAccountByEmail(email: string): Promise<AccountRecord | undefined> {
    return Promise.resolve([...this.rows.values()].find((row) => row.email === email));
  }

  findAccountById(id: string): Promise<AccountRecord | undefined> {
    return Promise.resolve(this.rows.get(id));
  }
}

class MemorySessions implements SessionStore {
  readonly rows = new Map<string, SessionRecord>();
  private next = 0;

  createSession(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    this.next += 1;

    const row: SessionRecord = {
      id: `session-${String(this.next)}`,
      accountId: input.accountId,
      csrfSecret: input.csrfSecret,
      lastSeenAt: new Date(),
      expiresAt: input.expiresAt,
    };

    this.rows.set(input.tokenHash, row);

    return Promise.resolve(row);
  }

  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<{ session: SessionRecord; account: AccountRecord } | undefined> {
    const session = this.rows.get(tokenHash);
    const account = accounts.rows.get(session?.accountId ?? '');

    return Promise.resolve(
      session === undefined || account === undefined ? undefined : { session, account },
    );
  }

  touchSession(): Promise<void> {
    return Promise.resolve();
  }

  deleteSession(id: string): Promise<void> {
    for (const [hash, row] of this.rows) {
      if (row.id === id) {
        this.rows.delete(hash);
      }
    }

    return Promise.resolve();
  }
}

class MemoryFamilies implements RememberStore {
  readonly rows = new Map<string, RememberRecord>();
  private next = 0;

  createRememberToken(input: {
    accountId: string;
    secretHash: string;
    expiresAt: Date;
  }): Promise<string> {
    this.next += 1;

    const family = `famille-${String(this.next)}`;

    this.rows.set(family, {
      family,
      accountId: input.accountId,
      secretHash: input.secretHash,
      previousSecretHash: null,
      rotatedAt: null,
      expiresAt: input.expiresAt,
    });

    return Promise.resolve(family);
  }

  findRememberFamily(family: string): Promise<RememberRecord | undefined> {
    return Promise.resolve(this.rows.get(family));
  }

  rotateRememberSecret(
    family: string,
    change: { secretHash: string; previousSecretHash: string; rotatedAt: Date },
  ): Promise<boolean> {
    const row = this.rows.get(family);

    /*
      La condition du vrai dépôt : la rotation ne modifie la ligne que si son
      secret est bien celui qu'on avait lu. C'est ce qui rend ce faux fidèle
      pour le cas des deux requêtes simultanées.
    */
    if (row === undefined || row.secretHash !== change.previousSecretHash) {
      return Promise.resolve(false);
    }

    this.rows.set(family, { ...row, ...change });

    return Promise.resolve(true);
  }

  deleteRememberFamily(family: string): Promise<void> {
    this.rows.delete(family);

    return Promise.resolve();
  }
}

class MemoryAttempts implements AttemptStore {
  readonly rows: { emailFingerprint: string; ipFingerprint: string; outcome: LoginOutcome }[] = [];
  purged = 0;

  countFailures(input: {
    emailFingerprint: string;
    ipFingerprint: string;
  }): Promise<{ byEmail: number; byIp: number }> {
    const failures = this.rows.filter((row) => row.outcome === 'failed');

    return Promise.resolve({
      byEmail: failures.filter((row) => row.emailFingerprint === input.emailFingerprint).length,
      byIp: failures.filter((row) => row.ipFingerprint === input.ipFingerprint).length,
    });
  }

  recordAttempt(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
  }): Promise<void> {
    this.rows.push(input);

    return Promise.resolve();
  }

  purgeExpired(): Promise<void> {
    this.purged += 1;

    return Promise.resolve();
  }
}

class RecordingLog implements AuthLog {
  readonly lines: { object: object; message: string }[] = [];

  setContext(): void {
    // Le contexte n'intéresse pas ces tests.
  }

  info(object: object, message: string): void {
    this.lines.push({ object, message });
  }

  warn(object: object, message: string): void {
    this.lines.push({ object, message });
  }
}

/** Le message d'une promesse qui doit échouer, sans faire de supposition. */
async function failureMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('cet appel devait échouer, et il a réussi');
}

/** La valeur d'un cookie dans un en-tête Set-Cookie, par son nom. */
function cookie(headers: string[], name: string): string | undefined {
  return headers.find((header) => header.startsWith(`${name}=`));
}

let accounts: MemoryAccounts;
let sessions: MemorySessions;
let families: MemoryFamilies;
let attempts: MemoryAttempts;
let log: RecordingLog;
let service: AuthService;

beforeAll(async () => {
  // Une seule fois : Argon2 coûte une centaine de millisecondes par empreinte.
  ACCOUNT.passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  process.env['SECURITY_PEPPER'] = PEPPER;
  accounts = new MemoryAccounts();
  accounts.rows.set(ACCOUNT.id, { ...ACCOUNT });
  sessions = new MemorySessions();
  families = new MemoryFamilies();
  attempts = new MemoryAttempts();
  log = new RecordingLog();
  service = new AuthService(
    accounts,
    new SessionService(sessions),
    new RememberService(families, log),
    new AttemptsService(attempts),
    log,
  );
});

describe('login', () => {
  it('ouvre une session et pose deux cookies', async () => {
    const { account, cookies } = await service.login(
      { email: EMAIL, password: PASSWORD, remember: false },
      IP,
    );

    expect(account).toEqual({
      id: ACCOUNT.id,
      email: EMAIL,
      householdId: ACCOUNT.householdId,
      role: 'user',
    });
    // L'empreinte du mot de passe ne sort pas du serveur.
    expect(JSON.stringify(account)).not.toContain('argon2');

    expect(sessions.rows.size).toBe(1);
    expect(cookies).toHaveLength(2);

    const session = cookie(cookies, 'mijote_session');

    expect(session).toContain('HttpOnly');
    expect(session).toContain('Secure');
    expect(session).toContain('SameSite=Lax');
    // Sans Max-Age : la session meurt à la fermeture du navigateur.
    expect(session).not.toContain('Max-Age');

    const csrf = cookie(cookies, 'mijote_csrf');

    // Le seul cookie que le script de la page doit pouvoir lire.
    expect(csrf).not.toContain('HttpOnly');
    expect(csrf).toContain('Secure');
  });

  it('pose en plus un cookie de trente jours quand on le lui demande', async () => {
    const { cookies } = await service.login(
      { email: EMAIL, password: PASSWORD, remember: true },
      IP,
    );

    expect(cookies).toHaveLength(3);

    const remember = cookie(cookies, 'mijote_remember');

    expect(remember).toContain(`Max-Age=${String(REMEMBER_TTL_MS / 1000)}`);
    expect(remember).toContain('HttpOnly');
    expect(families.rows.size).toBe(1);
    // Le secret du cookie n'est pas celui de la base : seule l'empreinte y est.
    expect(remember).not.toContain([...families.rows.values()][0]?.secretHash);
  });

  it("ne normalise pas l'adresse lui-même : le schéma partagé l'a déjà fait", async () => {
    /*
      La normalisation vit dans packages/shared, et ce qui arrive ici est donc
      déjà en minuscules et sans espaces. Une adresse en majuscules ne peut
      venir que d'un appel direct au service, et elle ne trouve aucun compte :
      c'est voulu, un second nettoyage ici cacherait le premier s'il tombait.
    */
    const message = await failureMessage(
      service.login({ email: EMAIL.toUpperCase(), password: PASSWORD, remember: false }, IP),
    );

    expect(message).toBe(INVALID_CREDENTIALS);
  });

  it('renvoie le même message pour une adresse inconnue et un mot de passe faux', async () => {
    const unknown = await failureMessage(
      service.login({ email: 'personne@exemple.test', password: PASSWORD, remember: false }, IP),
    );
    const wrong = await failureMessage(
      service.login({ email: EMAIL, password: 'pas le bon mot de passe', remember: false }, IP),
    );

    // Mot pour mot le même, et pas seulement « du même genre ».
    expect(unknown).toBe(INVALID_CREDENTIALS);
    expect(wrong).toBe(unknown);
    expect(sessions.rows.size).toBe(0);
    expect(attempts.rows.map((row) => row.outcome)).toEqual(['failed', 'failed']);
  });

  it("paie le coût d'Argon2 même sur une adresse inconnue", async () => {
    /*
      Le message identique ne suffit pas : sans l'empreinte leurre, une adresse
      inconnue répondrait sans payer le coût d'Argon2, et le temps de réponse
      dirait quels comptes existent.

      La mesure est volontairement large : elle vérifie que les deux chemins
      hachent, pas qu'ils durent exactement pareil.
    */
    const started = Date.now();

    await service
      .login({ email: 'personne@exemple.test', password: PASSWORD, remember: false }, IP)
      .catch(() => undefined);

    expect(Date.now() - started).toBeGreaterThan(40);
  });

  it('bloque après cinq échecs, sans dire si le compte existe', async () => {
    for (let count = 0; count < 5; count += 1) {
      await service
        .login({ email: EMAIL, password: 'faux', remember: false }, IP)
        .catch(() => undefined);
    }

    const blocked = await failureMessage(
      service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP),
    );

    expect(blocked).toContain('Trop de tentatives');
    // Même avec le bon mot de passe : aucune session n'est ouverte.
    expect(sessions.rows.size).toBe(0);
    expect(attempts.rows.at(-1)?.outcome).toBe('blocked');
  });

  it("n'écrit ni mot de passe, ni adresse, ni jeton dans les journaux", async () => {
    const { cookies } = await service.login(
      { email: EMAIL, password: PASSWORD, remember: true },
      IP,
    );

    await service
      .login({ email: EMAIL, password: 'faux', remember: false }, IP)
      .catch(() => undefined);

    const written = JSON.stringify(log.lines);

    expect(written).not.toContain(PASSWORD);
    expect(written).not.toContain(EMAIL);
    expect(written).not.toContain(IP);

    for (const header of cookies) {
      expect(written).not.toContain(header.split(';')[0]?.split('=')[1]);
    }

    // Les lignes utiles sont bien là, elles.
    expect(log.lines.map((line) => line.message)).toContain('connexion réussie');
    expect(log.lines.map((line) => line.message)).toContain('échec de connexion');
  });

  it('ferme la session que ce navigateur présentait', async () => {
    /*
      Sans cela, la session précédente resterait valable jusqu'à sa limite : se
      reconnecter en soupçonnant un vol ne fermerait rien, alors que c'est le
      premier réflexe.
    */
    const first = await service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP);
    const token = cookie(first.cookies, 'mijote_session')?.split(';')[0]?.split('=')[1];

    await service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP, token);

    // Une seule session ouverte : la nouvelle.
    expect(sessions.rows.size).toBe(1);
    expect(await new SessionService(sessions).resolve(token ?? '')).toBeUndefined();
  });

  it('purge les lignes périmées à la connexion réussie, pas aux échecs', async () => {
    await service
      .login({ email: EMAIL, password: 'faux', remember: false }, IP)
      .catch(() => undefined);

    expect(attempts.purged).toBe(0);

    await service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP);

    expect(attempts.purged).toBe(1);
  });
});

describe('current', () => {
  it('rend le compte et repose le cookie CSRF', async () => {
    const { cookies } = await service.login(
      { email: EMAIL, password: PASSWORD, remember: false },
      IP,
    );
    const token = cookie(cookies, 'mijote_session')?.split(';')[0]?.split('=')[1];
    const resolved = await service.current({ session: token, remember: undefined });

    expect(resolved?.account.id).toBe(ACCOUNT.id);
    expect(resolved?.cookies).toHaveLength(1);
    expect(resolved?.cookies[0]).toContain('mijote_csrf=');
  });

  it("ne rend rien quand il n'y a ni session ni mémorisation", async () => {
    expect(await service.current({ session: undefined, remember: undefined })).toBeUndefined();
    expect(
      await service.current({ session: 'jeton-inventé', remember: undefined }),
    ).toBeUndefined();
  });

  it('reprend la session par le cookie de mémorisation, et le fait tourner', async () => {
    const { cookies } = await service.login(
      { email: EMAIL, password: PASSWORD, remember: true },
      IP,
    );
    const remember = cookie(cookies, 'mijote_remember')?.split(';')[0]?.split('=')[1];

    // Le navigateur a été fermé : le cookie de session a disparu, l'autre non.
    const resumed = await service.current({ session: undefined, remember });

    expect(resumed?.account.id).toBe(ACCOUNT.id);
    expect(sessions.rows.size).toBe(2);

    const posed = resumed?.cookies ?? [];

    expect(cookie(posed, 'mijote_session')).toBeDefined();
    expect(cookie(posed, 'mijote_csrf')).toBeDefined();

    const rotated = cookie(posed, 'mijote_remember')?.split(';')[0]?.split('=')[1];

    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(remember);
  });
});

describe('logout', () => {
  it('ferme la session, le jeton de mémorisation, et efface les trois cookies', async () => {
    const opened = await service.login({ email: EMAIL, password: PASSWORD, remember: true }, IP);
    const token = cookie(opened.cookies, 'mijote_session')?.split(';')[0]?.split('=')[1];
    const remember = cookie(opened.cookies, 'mijote_remember')?.split(';')[0]?.split('=')[1];
    const authenticated = await new SessionService(sessions).resolve(token ?? '');

    if (authenticated === undefined) {
      throw new Error("la session qui vient d'être ouverte est introuvable");
    }

    const cleared = await service.logout(authenticated, remember);

    expect(sessions.rows.size).toBe(0);
    expect(families.rows.size).toBe(0);
    expect(cleared).toHaveLength(3);

    for (const header of cleared) {
      expect(header).toContain('Max-Age=0');
    }
  });
});
