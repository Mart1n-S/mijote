import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { formatBackupCode } from '../security/backup-codes.js';
import { encrypt, readEncryptionKey } from '../security/encryption.js';
import { hashPassword } from '../security/passwords.js';
import { createTotpSecret, stepAt, totpCode } from '../security/totp.js';

import { AttemptsService, type AttemptStore } from './attempts.service.js';
import type { AuthLog } from './auth.log.js';
import type {
  AccountRecord,
  BackupCodeRecord,
  LoginOutcome,
  LoginPurpose,
  PendingLoginRecord,
  RememberRecord,
  SessionRecord,
  TwoFactorRecord,
} from './auth.repository.js';
import { type AccountStore, AuthService, type AuthenticatedResponse } from './auth.service.js';
import {
  MAX_PENDING_ATTEMPTS,
  PendingLoginService,
  type PendingLoginStore,
} from './pending-login.service.js';
import { RememberService, type RememberStore } from './remember.service.js';
import { SessionService, type SessionStore } from './session.service.js';
import { TwoFactorService, type TwoFactorStore } from './two-factor.service.js';

/*
  Le second facteur, de la connexion à la désactivation, sur les vrais services
  branchés sur des tables en mémoire.

  Les faux reproduisent les **conditions** du vrai dépôt, et c'est ce qui compte
  ici : la rotation du pas accepté et la consommation d'un code de secours sont
  conditionnelles en SQL, donc elles le sont aussi ici, sinon les tests de
  simultanéité ne prouveraient rien.
*/

const PEPPER = Buffer.alloc(32).toString('base64');
const TOTP_KEY = Buffer.alloc(32, 3).toString('base64');
const KEY = readEncryptionKey({ SECURITY_TOTP_KEY: TOTP_KEY });

const PASSWORD = 'un mot de passe assez long';
const EMAIL = 'martin@exemple.test';
const IP = '203.0.113.7';

/** Un code de secours connu, pour n'avoir qu'une empreinte Argon2 à calculer. */
const BACKUP_SECRET = 'KMXQPTBVZRDC';
const BACKUP_POSITION = 3;

const ACCOUNT: AccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  email: EMAIL,
  passwordHash: '',
  role: 'admin',
};

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
    adminUnlockedAt?: Date;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    this.next += 1;

    const row: SessionRecord = {
      id: `session-${String(this.next)}`,
      accountId: input.accountId,
      csrfSecret: input.csrfSecret,
      lastSeenAt: new Date(),
      expiresAt: input.expiresAt,
      adminUnlockedAt: input.adminUnlockedAt ?? null,
    };

    this.rows.set(input.tokenHash, row);

    return Promise.resolve(row);
  }

  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<{ session: SessionRecord; account: AccountRecord } | undefined> {
    const session = this.rows.get(tokenHash);
    const owner = accounts.rows.get(session?.accountId ?? '');

    return Promise.resolve(
      session === undefined || owner === undefined ? undefined : { session, account: owner },
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

  unlockSession(id: string, at: Date): Promise<void> {
    for (const [hash, row] of this.rows) {
      if (row.id === id) {
        this.rows.set(hash, { ...row, adminUnlockedAt: at });
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
  readonly rows: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
    purpose: LoginPurpose;
  }[] = [];

  countFailures(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    purpose: LoginPurpose;
  }): Promise<{ byEmail: number; byIp: number }> {
    const failures = this.rows.filter(
      (row) => row.outcome === 'failed' && row.purpose === input.purpose,
    );

    return Promise.resolve({
      byEmail: failures.filter((row) => row.emailFingerprint === input.emailFingerprint).length,
      byIp: failures.filter((row) => row.ipFingerprint === input.ipFingerprint).length,
    });
  }

  recordAttempt(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
    purpose: LoginPurpose;
  }): Promise<void> {
    this.rows.push(input);

    return Promise.resolve();
  }

  purgeExpired(): Promise<void> {
    return Promise.resolve();
  }
}

class MemoryPendingLogins implements PendingLoginStore {
  readonly rows = new Map<string, PendingLoginRecord>();
  private next = 0;

  createPendingLogin(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    remember: boolean;
    expiresAt: Date;
  }): Promise<void> {
    this.next += 1;

    this.rows.set(input.tokenHash, {
      id: `attente-${String(this.next)}`,
      accountId: input.accountId,
      csrfSecret: input.csrfSecret,
      attempts: 0,
      remember: input.remember,
      expiresAt: input.expiresAt,
    });

    return Promise.resolve();
  }

  findPendingLoginByTokenHash(
    tokenHash: string,
  ): Promise<{ pending: PendingLoginRecord; account: AccountRecord } | undefined> {
    const pending = this.rows.get(tokenHash);
    const owner = accounts.rows.get(pending?.accountId ?? '');

    return Promise.resolve(
      pending === undefined || owner === undefined ? undefined : { pending, account: owner },
    );
  }

  /** L'incrément est fait par la base, en une requête : le faux fait de même. */
  countPendingAttempt(id: string): Promise<number> {
    for (const [hash, row] of this.rows) {
      if (row.id === id) {
        const attempts = row.attempts + 1;

        this.rows.set(hash, { ...row, attempts });

        return Promise.resolve(attempts);
      }
    }

    return Promise.resolve(0);
  }

  deletePendingLogin(id: string): Promise<void> {
    for (const [hash, row] of this.rows) {
      if (row.id === id) {
        this.rows.delete(hash);
      }
    }

    return Promise.resolve();
  }

  /** Vieillit l'attente, pour mesurer son expiration. */
  expire(): void {
    for (const [hash, row] of this.rows) {
      this.rows.set(hash, { ...row, expiresAt: new Date(Date.now() - 1) });
    }
  }
}

class MemoryTwoFactor implements TwoFactorStore {
  readonly rows = new Map<string, TwoFactorRecord>();
  readonly backups = new Map<string, BackupCodeRecord>();

  findTwoFactor(accountId: string): Promise<TwoFactorRecord | undefined> {
    return Promise.resolve(this.rows.get(accountId));
  }

  /** Une inscription déjà confirmée n'est jamais écrasée : c'est le `setWhere`. */
  upsertInactiveTwoFactor(accountId: string, secretCipher: string): Promise<boolean> {
    const existing = this.rows.get(accountId);

    if (existing !== undefined && existing.activatedAt !== null) {
      return Promise.resolve(false);
    }

    this.rows.set(accountId, { accountId, secretCipher, activatedAt: null, lastUsedStep: null });

    return Promise.resolve(true);
  }

  /*
    Conditionnelle et en un seul temps, comme le vrai dépôt : le secret doit
    être resté celui qu'un code vient de vérifier, et les codes de secours ne
    sont posés que si l'activation a bien eu lieu.
  */
  activateTwoFactor(
    accountId: string,
    at: Date,
    verifiedCipher: string,
    codes: { position: number; codeHash: string }[],
  ): Promise<boolean> {
    const row = this.rows.get(accountId);

    if (row === undefined || row.activatedAt !== null || row.secretCipher !== verifiedCipher) {
      return Promise.resolve(false);
    }

    this.rows.set(accountId, { ...row, activatedAt: at });

    for (const key of [...this.backups.keys()]) {
      if (key.startsWith(`${accountId}:`)) {
        this.backups.delete(key);
      }
    }

    for (const code of codes) {
      this.backups.set(`${accountId}:${String(code.position)}`, {
        id: `code-${String(code.position)}`,
        codeHash: code.codeHash,
        usedAt: null,
      });
    }

    return Promise.resolve(true);
  }

  deleteTwoFactor(accountId: string): Promise<void> {
    this.rows.delete(accountId);

    for (const key of [...this.backups.keys()]) {
      if (key.startsWith(`${accountId}:`)) {
        this.backups.delete(key);
      }
    }

    return Promise.resolve();
  }

  /** La condition du vrai dépôt : le pas doit être strictement plus récent. */
  claimTotpStep(accountId: string, step: number): Promise<boolean> {
    const row = this.rows.get(accountId);

    if (row === undefined || (row.lastUsedStep !== null && row.lastUsedStep >= step)) {
      return Promise.resolve(false);
    }

    this.rows.set(accountId, { ...row, lastUsedStep: step });

    return Promise.resolve(true);
  }

  findBackupCode(accountId: string, position: number): Promise<BackupCodeRecord | undefined> {
    return Promise.resolve(this.backups.get(`${accountId}:${String(position)}`));
  }

  /** Conditionnelle elle aussi : un code ne se consomme qu'une fois. */
  consumeBackupCode(id: string, at: Date): Promise<boolean> {
    for (const [key, row] of this.backups) {
      if (row.id === id) {
        if (row.usedAt !== null) {
          return Promise.resolve(false);
        }

        this.backups.set(key, { ...row, usedAt: at });

        return Promise.resolve(true);
      }
    }

    return Promise.resolve(false);
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

let accounts: MemoryAccounts;
let sessions: MemorySessions;
let families: MemoryFamilies;
let attempts: MemoryAttempts;
let waiting: MemoryPendingLogins;
let twoFactor: MemoryTwoFactor;
let log: RecordingLog;
let service: AuthService;
let sessionService: SessionService;

/** Le secret TOTP du compte, tiré une fois pour tout le fichier. */
const SECRET = createTotpSecret();

/** Le code du moment, celui que l'application afficherait. */
function currentCode(secret = SECRET): string {
  return totpCode(secret, stepAt(new Date()));
}

/** Pose une double authentification active, sans payer dix Argon2. */
function enableTwoFactor(secret = SECRET): void {
  twoFactor.rows.set(ACCOUNT.id, {
    accountId: ACCOUNT.id,
    secretCipher: encrypt(KEY, ACCOUNT.id, secret),
    activatedAt: new Date(),
    lastUsedStep: null,
  });
}

/** Pose un seul code de secours connu, à la position 3. */
function addBackupCode(hash: string): void {
  twoFactor.backups.set(`${ACCOUNT.id}:${String(BACKUP_POSITION)}`, {
    id: 'code-3',
    codeHash: hash,
    usedAt: null,
  });
}

/** La connexion jusqu'à l'attente du code, et le jeton de cette attente. */
async function loginUntilCode(remember = false): Promise<string> {
  const result = await service.login({ email: EMAIL, password: PASSWORD, remember }, IP);

  if (!('twoFactorRequired' in result)) {
    throw new Error('un second facteur était attendu');
  }

  const cookie = result.cookies.find((header) => header.startsWith('mijote_pending='));

  return cookie?.split(';')[0]?.split('=')[1] ?? '';
}

/** Soumet un code, comme le contrôleur le fait après la garde. */
async function submitCode(token: string, code: string): Promise<AuthenticatedResponse> {
  const pending = await new PendingLoginService(waiting).resolve(token);

  if (pending === undefined) {
    throw new Error('attente introuvable');
  }

  return service.completeTwoFactor(pending, code, IP);
}

/** Le message d'une promesse qui doit échouer. */
async function failureMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('cet appel devait échouer, et il a réussi');
}

let backupHash = '';

beforeAll(async () => {
  // Deux empreintes Argon2 pour tout le fichier : le mot de passe et le code.
  ACCOUNT.passwordHash = await hashPassword(PASSWORD);
  backupHash = await hashPassword(BACKUP_SECRET);
});

beforeEach(() => {
  process.env['SECURITY_PEPPER'] = PEPPER;
  process.env['SECURITY_TOTP_KEY'] = TOTP_KEY;
  accounts = new MemoryAccounts();
  accounts.rows.set(ACCOUNT.id, { ...ACCOUNT });
  sessions = new MemorySessions();
  families = new MemoryFamilies();
  attempts = new MemoryAttempts();
  waiting = new MemoryPendingLogins();
  twoFactor = new MemoryTwoFactor();
  log = new RecordingLog();
  sessionService = new SessionService(sessions);
  service = new AuthService(
    accounts,
    sessionService,
    new RememberService(families, log),
    new AttemptsService(attempts),
    new PendingLoginService(waiting),
    new TwoFactorService(twoFactor, log),
    log,
  );
});

describe('la connexion avec un second facteur', () => {
  it("n'ouvre pas de session au mot de passe, et pose l'attente", async () => {
    enableTwoFactor();

    const result = await service.login({ email: EMAIL, password: PASSWORD, remember: true }, IP);

    expect('twoFactorRequired' in result).toBe(true);
    expect('account' in result).toBe(false);
    // Aucune session, et surtout aucun jeton de mémorisation : le second
    // facteur n'est pas encore prouvé.
    expect(sessions.rows.size).toBe(0);
    expect(families.rows.size).toBe(0);
    expect(waiting.rows.size).toBe(1);

    const cookies = 'cookies' in result ? result.cookies : [];

    expect(cookies.some((header) => header.startsWith('mijote_pending='))).toBe(true);
    expect(cookies.some((header) => header.startsWith('mijote_csrf='))).toBe(true);
    // Le cookie d'attente est hors de portée du script, comme celui de session.
    expect(cookies.find((header) => header.startsWith('mijote_pending='))).toContain('HttpOnly');
  });

  it("ouvre la session au bon code, avec ses droits d'administration", async () => {
    enableTwoFactor();

    const token = await loginUntilCode();
    const opened = await submitCode(token, currentCode());

    expect(opened.account.id).toBe(ACCOUNT.id);
    expect(opened.twoFactor).toEqual({ active: true });
    expect(sessions.rows.size).toBe(1);
    // L'attente est détruite, et son cookie effacé.
    expect(waiting.rows.size).toBe(0);
    expect(opened.cookies.some((header) => header.startsWith('mijote_pending=;'))).toBe(true);

    const session = [...sessions.rows.values()][0];

    // Le code vient d'être validé : l'administration est ouverte.
    expect(session?.adminUnlockedAt).toBeInstanceOf(Date);
  });

  it('honore « se souvenir de moi » après le code, et pas avant', async () => {
    enableTwoFactor();

    const token = await loginUntilCode(true);

    expect(families.rows.size).toBe(0);

    const opened = await submitCode(token, currentCode());

    expect(families.rows.size).toBe(1);
    expect(opened.cookies.some((header) => header.startsWith('mijote_remember='))).toBe(true);
  });

  it('refuse un code faux, sans ouvrir de session', async () => {
    enableTwoFactor();

    const token = await loginUntilCode();

    expect(await failureMessage(submitCode(token, '000000'))).toBe('Code incorrect ou expiré.');
    expect(sessions.rows.size).toBe(0);
    // L'attente survit, pour laisser une seconde chance.
    expect(waiting.rows.size).toBe(1);
  });

  it('refuse un code hors de sa fenêtre de temps', async () => {
    enableTwoFactor();

    const token = await loginUntilCode();
    // Deux pas plus tôt : au-delà de la tolérance d'une fenêtre.
    const old = totpCode(SECRET, stepAt(new Date()) - 2);

    expect(await failureMessage(submitCode(token, old))).toBe('Code incorrect ou expiré.');
  });

  it('refuse le même code deux fois, dans sa fenêtre', async () => {
    /*
      Le rejeu : un code intercepté ne doit pas resservir pendant les trente
      secondes où il reste mathématiquement valable.
    */
    enableTwoFactor();

    const code = currentCode();
    const first = await loginUntilCode();

    await submitCode(first, code);

    const second = await loginUntilCode();

    expect(await failureMessage(submitCode(second, code))).toBe('Code incorrect ou expiré.');
    expect(sessions.rows.size).toBe(1);
  });

  it("ne laisse passer qu'une seule de deux soumissions simultanées", async () => {
    /*
      Deux requêtes vraiment parallèles, avec le même code : la mise à jour du
      pas accepté étant conditionnelle, la seconde ne modifie aucune ligne et
      est refusée. Sans cette condition, les deux ouvriraient une session.
    */
    enableTwoFactor();

    const code = currentCode();
    const [firstToken, secondToken] = [await loginUntilCode(), await loginUntilCode()];
    const outcomes = await Promise.allSettled([
      submitCode(firstToken, code),
      submitCode(secondToken, code),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(sessions.rows.size).toBe(1);
  });

  it("détruit l'attente au cinquième essai raté", async () => {
    enableTwoFactor();

    const token = await loginUntilCode();

    for (let attempt = 0; attempt < MAX_PENDING_ATTEMPTS; attempt += 1) {
      await failureMessage(submitCode(token, '000000'));
    }

    expect(waiting.rows.size).toBe(0);
    // Le cookie ne vaut plus rien : il faut repasser par le mot de passe.
    expect(await failureMessage(submitCode(token, currentCode()))).toContain('introuvable');
  });

  it('refuse une attente expirée', async () => {
    enableTwoFactor();

    const token = await loginUntilCode();

    waiting.expire();

    expect(await failureMessage(submitCode(token, currentCode()))).toContain('introuvable');
    // Et la ligne périmée est effacée au passage.
    expect(waiting.rows.size).toBe(0);
  });

  it('bloque après cinq codes faux, et compte à part des mots de passe', async () => {
    enableTwoFactor();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = await loginUntilCode();

      await failureMessage(submitCode(token, '000000'));
    }

    const token = await loginUntilCode();

    expect(await failureMessage(submitCode(token, currentCode()))).toContain('Trop de codes');

    /*
      Les deux compteurs restent séparés : cinq codes faux ne bloquent pas la
      connexion elle-même, qui a son propre compteur.
    */
    expect(attempts.rows.filter((row) => row.purpose === 'code').length).toBeGreaterThan(0);
    const result = await service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP);

    expect('twoFactorRequired' in result).toBe(true);
  });

  it('ne journalise ni le code, ni le secret', async () => {
    enableTwoFactor();

    const code = currentCode();
    const token = await loginUntilCode();

    await submitCode(token, code);

    const written = JSON.stringify(log.lines);

    expect(written).not.toContain(code);
    expect(written).not.toContain(SECRET);
    expect(written).not.toContain(EMAIL);
    expect(log.lines.map((line) => line.message)).toContain('second facteur validé');
  });
});

describe('les codes de secours', () => {
  beforeEach(() => {
    enableTwoFactor();
    addBackupCode(backupHash);
  });

  it("ouvre la session, et ne servent qu'une fois", async () => {
    const display = formatBackupCode(BACKUP_POSITION, BACKUP_SECRET);
    const opened = await submitCode(await loginUntilCode(), display);

    expect(opened.account.id).toBe(ACCOUNT.id);

    // Le même code, une seconde fois : refusé, comme un code faux.
    expect(await failureMessage(submitCode(await loginUntilCode(), display))).toBe(
      'Code incorrect ou expiré.',
    );
  });

  it('se laissent taper en minuscules, avec ou sans tirets', async () => {
    const opened = await submitCode(
      await loginUntilCode(),
      `${String(BACKUP_POSITION)} ${BACKUP_SECRET.toLowerCase()}`,
    );

    expect(opened.account.id).toBe(ACCOUNT.id);
  });

  it('répondent la même chose pour un code faux, consommé ou hors plage', async () => {
    /*
      Les trois dépendent de la base, donc ils partagent le message : sinon la
      réponse dirait combien de codes existent et lesquels ont servi.
    */
    const wrong = await failureMessage(
      submitCode(await loginUntilCode(), formatBackupCode(BACKUP_POSITION, 'ZZZZZZZZZZZZ')),
    );
    const outOfRange = await failureMessage(
      submitCode(await loginUntilCode(), formatBackupCode(42, BACKUP_SECRET)),
    );

    await submitCode(await loginUntilCode(), formatBackupCode(BACKUP_POSITION, BACKUP_SECRET));

    const consumed = await failureMessage(
      submitCode(await loginUntilCode(), formatBackupCode(BACKUP_POSITION, BACKUP_SECRET)),
    );

    expect(wrong).toBe('Code incorrect ou expiré.');
    expect(outOfRange).toBe(wrong);
    expect(consumed).toBe(wrong);
  });

  it('disent seulement le défaut de forme, qui ne dépend de rien', async () => {
    // Le numéro manquant est le seul cas distinct : il ne dit rien de la base.
    const malformed = await failureMessage(submitCode(await loginUntilCode(), BACKUP_SECRET));

    expect(malformed).toContain('commence par son numéro');
  });

  it('sont journalisés sans leur valeur', async () => {
    await submitCode(await loginUntilCode(), formatBackupCode(BACKUP_POSITION, BACKUP_SECRET));

    const written = JSON.stringify(log.lines);

    expect(written).not.toContain(BACKUP_SECRET);
    expect(log.lines.map((line) => line.message)).toContain('code de secours utilisé');
  });
});

describe("l'activation", () => {
  /** Une session ouverte pour le compte, sans second facteur. */
  async function openSession(): Promise<{ token: string }> {
    const result = await service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP);

    if ('twoFactorRequired' in result) {
      throw new Error('aucun second facteur ne devait être attendu');
    }

    const cookie = result.cookies.find((header) => header.startsWith('mijote_session='));

    return { token: cookie?.split(';')[0]?.split('=')[1] ?? '' };
  }

  async function authenticated() {
    const { token } = await openSession();
    const resolved = await sessionService.resolve(token);

    if (resolved === undefined) {
      throw new Error('session introuvable');
    }

    return resolved;
  }

  it('exige le mot de passe pour commencer, et le vérifie', async () => {
    /*
      Le scénario que cela ferme : une session volée d'un administrateur sans
      second facteur inscrirait l'application de l'attaquant, obtiendrait
      l'administration et verrouillerait le propriétaire.
    */
    const session = await authenticated();

    expect(await failureMessage(service.startTwoFactorSetup(session, 'pas le bon', IP))).toBe(
      'Mot de passe incorrect.',
    );
    // Aucun secret n'a été engendré.
    expect(twoFactor.rows.size).toBe(0);
  });

  it('exige aussi le mot de passe pour confirmer', async () => {
    const session = await authenticated();

    await service.startTwoFactorSetup(session, PASSWORD, IP);

    expect(
      await failureMessage(service.activateTwoFactor(session, 'pas le bon', '000000', IP)),
    ).toBe('Mot de passe incorrect.');
    // Le secret reste inactif.
    expect(twoFactor.rows.get(ACCOUNT.id)?.activatedAt).toBeNull();
  });

  it("rend une clé lisible et une URI, et n'active rien encore", async () => {
    const session = await authenticated();
    const started = await service.startTwoFactorSetup(session, PASSWORD, IP);

    expect(started.key).toMatch(/^[A-Z2-7]{32}$/);
    expect(started.uri).toContain('otpauth://totp/');
    expect(started.uri).toContain(started.key);
    expect(await new TwoFactorService(twoFactor, log).isActive(ACCOUNT.id)).toBe(false);
    // Le secret est chiffré en base, jamais en clair.
    expect(twoFactor.rows.get(ACCOUNT.id)?.secretCipher).not.toContain(started.key);
  });

  it('refuse un premier code faux, et active avec le bon', async () => {
    const session = await authenticated();
    const started = await service.startTwoFactorSetup(session, PASSWORD, IP);

    expect(await failureMessage(service.activateTwoFactor(session, PASSWORD, '000000', IP))).toBe(
      'Code incorrect ou expiré.',
    );
    expect(twoFactor.rows.get(ACCOUNT.id)?.activatedAt).toBeNull();

    const codes = await service.activateTwoFactor(session, PASSWORD, currentCode(started.key), IP);

    expect(codes).toHaveLength(10);
    expect(twoFactor.rows.get(ACCOUNT.id)?.activatedAt).toBeInstanceOf(Date);
    // Dix empreintes en base, et jamais les codes eux-mêmes.
    expect(twoFactor.backups.size).toBe(10);

    for (const code of codes) {
      expect(JSON.stringify([...twoFactor.backups.values()])).not.toContain(code.secret);
    }
  });

  it("ouvre les droits d'administration de la session qui active", async () => {
    // Activer, c'est valider un code : redemander un second code aussitôt
    // n'apporterait rien.
    const session = await authenticated();
    const started = await service.startTwoFactorSetup(session, PASSWORD, IP);

    await service.activateTwoFactor(session, PASSWORD, currentCode(started.key), IP);

    expect([...sessions.rows.values()][0]?.adminUnlockedAt).toBeInstanceOf(Date);
  });

  it('limite les essais de mot de passe, sans bloquer la connexion', async () => {
    /*
      Le point relevé par la relecture sécurité : sans limitation, une session
      volée permettait de deviner le mot de passe sans borne, et chaque essai
      réservait 64 Mio d'Argon2. C'est pourtant ce mot de passe qui empêche
      cette session d'inscrire l'application de l'attaquant.
    */
    const session = await authenticated();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failureMessage(service.startTwoFactorSetup(session, 'pas le bon', IP));
    }

    // Même avec le bon mot de passe : bloqué.
    expect(await failureMessage(service.startTwoFactorSetup(session, PASSWORD, IP))).toContain(
      'Trop de mots de passe',
    );
    expect(twoFactor.rows.size).toBe(0);

    /*
      Et la connexion reste ouverte : les deux compteurs sont séparés, sans quoi
      un porteur de session volée verrouillerait le vrai propriétaire dehors.
    */
    const result = await service.login({ email: EMAIL, password: PASSWORD, remember: false }, IP);

    expect('account' in result).toBe(true);
  });

  it("compte aussi le code refusé à l'activation", async () => {
    const session = await authenticated();

    await service.startTwoFactorSetup(session, PASSWORD, IP);
    await failureMessage(service.activateTwoFactor(session, PASSWORD, '000000', IP));

    /*
      « Les essais de code sont limités » ne souffre pas d'exception : cette
      route serait sinon la seule sans compteur.
    */
    expect(
      attempts.rows.filter((row) => row.purpose === 'code' && row.outcome === 'failed'),
    ).toHaveLength(1);
  });

  it('refuse le second facteur à un compte ordinaire', async () => {
    /*
      L'issue #11 met la double authentification des autres comptes hors
      périmètre, et aucun écran ne la propose : un compte ordinaire qui taperait
      l'adresse pourrait sinon inscrire une application et ne plus pouvoir la
      retirer.
    */
    accounts.rows.set(ACCOUNT.id, { ...ACCOUNT, role: 'user' });

    const session = await authenticated();

    expect(await failureMessage(service.startTwoFactorSetup(session, PASSWORD, IP))).toContain(
      "comptes d'administration",
    );
    expect(await failureMessage(service.unlockAdmin(session, '000000', IP))).toContain(
      "comptes d'administration",
    );
    expect(twoFactor.rows.size).toBe(0);
  });

  it('refuse de réinscrire une application quand elle est déjà active', async () => {
    /*
      La session est ouverte avant l'activation : une fois le second facteur
      actif, la connexion passe par le code, et ce test porte sur le refus de
      `setup`, pas sur le parcours de connexion.
    */
    const session = await authenticated();

    enableTwoFactor();

    const before = twoFactor.rows.get(ACCOUNT.id)?.secretCipher;

    expect(await failureMessage(service.startTwoFactorSetup(session, PASSWORD, IP))).toContain(
      'déjà active',
    );
    // Le secret en place n'a pas bougé : seule la désactivation en change.
    expect(twoFactor.rows.get(ACCOUNT.id)?.secretCipher).toBe(before);
  });

  it("ne journalise ni la clé ni l'URI", async () => {
    const session = await authenticated();
    const started = await service.startTwoFactorSetup(session, PASSWORD, IP);
    const written = JSON.stringify(log.lines);

    expect(written).not.toContain(started.key);
    expect(written).not.toContain('otpauth');
  });
});

describe('la désactivation', () => {
  it('exige le mot de passe et un code', async () => {
    enableTwoFactor();
    addBackupCode(backupHash);

    const opened = await submitCode(await loginUntilCode(), currentCode());
    const sessionToken = opened.cookies
      .find((header) => header.startsWith('mijote_session='))
      ?.split(';')[0]
      ?.split('=')[1];
    const session = await sessionService.resolve(sessionToken ?? '');

    if (session === undefined) {
      throw new Error('session introuvable');
    }

    // Sans le mot de passe : refusé, et rien n'est désactivé.
    expect(
      await failureMessage(service.disableTwoFactor(session, 'pas le bon', currentCode(), IP)),
    ).toBe('Mot de passe incorrect.');
    expect(twoFactor.rows.size).toBe(1);

    // Avec le mot de passe mais un code faux : refusé aussi.
    expect(await failureMessage(service.disableTwoFactor(session, PASSWORD, '000000', IP))).toBe(
      'Code incorrect ou expiré.',
    );
    expect(twoFactor.rows.size).toBe(1);

    /*
      Avec un code de secours : c'est le chemin du téléphone perdu, et il doit
      marcher, sinon personne ne peut plus changer d'appareil.
    */
    await service.disableTwoFactor(
      session,
      PASSWORD,
      formatBackupCode(BACKUP_POSITION, BACKUP_SECRET),
      IP,
    );

    expect(twoFactor.rows.size).toBe(0);
    // Les codes de secours partent avec elle.
    expect(twoFactor.backups.size).toBe(0);
    expect(log.lines.map((line) => line.message)).toContain('double authentification désactivée');
  });
});

describe("le déverrouillage de l'administration", () => {
  it("ouvre les droits d'une session reprise par la mémorisation", async () => {
    /*
      Le cookie de mémorisation rouvre l'application, pas l'administration :
      la session reprise naît sans droits, et c'est un code qui les ouvre.
    */
    enableTwoFactor();

    const opened = await submitCode(await loginUntilCode(true), currentCode());
    const rememberValue = opened.cookies
      .find((header) => header.startsWith('mijote_remember='))
      ?.split(';')[0]
      ?.split('=')[1];

    const resumed = await service.resume(rememberValue ?? '');
    const sessionToken = resumed?.cookies
      .find((header) => header.startsWith('mijote_session='))
      ?.split(';')[0]
      ?.split('=')[1];
    const session = await sessionService.resolve(sessionToken ?? '');

    if (session === undefined) {
      throw new Error('session introuvable');
    }

    expect(session.session.adminUnlockedAt).toBeNull();

    /*
      Le code de la connexion a déjà servi : il faut celui de la fenêtre
      suivante, que l'application affichera trente secondes plus tard. Le
      refuser serait le rejeu, mesuré plus haut.
    */
    await service.unlockAdmin(session, totpCode(SECRET, stepAt(new Date()) + 1), IP);

    const unlocked = await sessionService.resolve(sessionToken ?? '');

    expect(unlocked?.session.adminUnlockedAt).toBeInstanceOf(Date);
  });

  it('refuse un code faux, et laisse la session sans droits', async () => {
    enableTwoFactor();

    const opened = await submitCode(await loginUntilCode(), currentCode());
    const sessionToken = opened.cookies
      .find((header) => header.startsWith('mijote_session='))
      ?.split(';')[0]
      ?.split('=')[1];
    const session = await sessionService.resolve(sessionToken ?? '');

    if (session === undefined) {
      throw new Error('session introuvable');
    }

    expect(await failureMessage(service.unlockAdmin(session, '000000', IP))).toBe(
      'Code incorrect ou expiré.',
    );
  });
});
