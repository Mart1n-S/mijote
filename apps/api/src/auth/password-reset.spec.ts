import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ProblemException } from '../errors/problem.exception.js';
import type { MailMessage, Mailer } from '../mail/mailer.js';
import { verifyPassword } from '../security/passwords.js';
import { hashSecret } from '../security/tokens.js';

import { ATTEMPT_WINDOW_MS, AttemptsService, type AttemptStore } from './attempts.service.js';
import type { AuthLog } from './auth.log.js';
import type { AccountRecord, LoginOutcome, LoginPurpose } from './auth.repository.js';
import {
  MAX_PER_EMAIL_PER_DAY,
  MAX_PER_EMAIL_PER_HOUR,
  MAX_PER_IP_PER_HOUR,
  PasswordResetService,
  type PasswordResetStore,
  type ResetAccountStore,
  RESET_TTL_MS,
} from './password-reset.service.js';

/*
  La demande de réinitialisation, sans HTTP et sans PostgreSQL : le vrai
  service, branché sur des tables en mémoire.

  Ce fichier mesure la seule chose qui compte vraiment ici : **la demande fait
  exactement le même travail, qu'un compte existe ou non**, et la réponse
  n'attend aucun envoi. Un chronomètre serait instable ; ce qui est mesuré est
  la suite des appels et l'absence d'attente, ce qui ne dérive pas.

  Ce que le SQL seul peut dire (l'index unique partiel, deux demandes vraiment
  parallèles) se mesure dans password-reset.integration.spec.ts, contre une
  vraie base.
*/

const PEPPER = Buffer.alloc(32, 7).toString('base64');
const BASE_URL = 'https://mijote.local';

const KNOWN = 'titulaire@exemple.test';
const UNKNOWN = 'personne@exemple.test';
const IP = '203.0.113.7';

const ACCOUNT: AccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  email: KNOWN,
  passwordHash: '$argon2id$peu importe',
  role: 'user',
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Une erreur de violation d'unicité, telle que Drizzle l'enveloppe. */
function uniqueViolation(): Error {
  const driver = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });

  return new Error('Failed query: insert into password_reset ...', { cause: driver });
}

class MemoryAccounts implements ResetAccountStore {
  /** Les adresses cherchées, dans l'ordre : c'est ce qui dit quand on cherche. */
  readonly lookups: string[] = [];

  constructor(private readonly rows: AccountRecord[] = [ACCOUNT]) {}

  findAccountByEmail(email: string): Promise<AccountRecord | undefined> {
    this.lookups.push(email);

    return Promise.resolve(this.rows.find((row) => row.email === email));
  }

  findAccountById(id: string): Promise<AccountRecord | undefined> {
    return Promise.resolve(this.rows.find((row) => row.id === id));
  }
}

interface StoredReset {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

class MemoryResets implements PasswordResetStore {
  readonly rows: StoredReset[] = [];
  /** Posée pour mesurer ce que fait le service quand l'index refuse. */
  failWith: Error | undefined;
  /** Posée pour jouer la consommation perdue d'une soumission simultanée. */
  consumeFails = false;
  /** Ce que la transaction a reçu, dans l'ordre : c'est ce qu'elle a écrit. */
  readonly applied: {
    accountId: string;
    passwordHash: string;
    emailFingerprint: string;
    failuresSince: Date;
  }[] = [];
  /** Deux appareils connectés, et deux appareils mémorisés, avant la réinitialisation. */
  sessions = 2;
  families = 2;
  private next = 0;

  replaceLivePasswordReset(input: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
    at: Date;
  }): Promise<{ id: string }> {
    if (this.failWith !== undefined) {
      return Promise.reject(this.failWith);
    }

    for (const row of this.rows) {
      if (row.accountId === input.accountId && row.usedAt === null && row.revokedAt === null) {
        row.revokedAt = input.at;
      }
    }

    this.next += 1;

    const created: StoredReset = {
      id: `reset-${String(this.next)}`,
      accountId: input.accountId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      revokedAt: null,
    };

    this.rows.push(created);

    return Promise.resolve({ id: created.id });
  }

  /** Pose un jeton tel quel, pour mesurer un état que le service ne crée pas. */
  seed(input: {
    token: string;
    accountId?: string;
    expiresAt?: Date;
    usedAt?: Date;
    revokedAt?: Date;
  }): StoredReset {
    this.next += 1;

    const record: StoredReset = {
      id: `reset-${String(this.next)}`,
      accountId: input.accountId ?? ACCOUNT.id,
      tokenHash: hashSecret(input.token),
      expiresAt: input.expiresAt ?? new Date(Date.now() + HOUR_MS),
      usedAt: input.usedAt ?? null,
      revokedAt: input.revokedAt ?? null,
    };

    this.rows.push(record);

    return record;
  }

  findPasswordResetByTokenHash(tokenHash: string): Promise<StoredReset | undefined> {
    return Promise.resolve(this.rows.find((row) => row.tokenHash === tokenHash));
  }

  consumePasswordReset(id: string, at: Date): Promise<boolean> {
    if (this.consumeFails) {
      return Promise.resolve(false);
    }

    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.usedAt === null &&
        candidate.revokedAt === null &&
        candidate.expiresAt >= at,
    );

    if (row === undefined) {
      return Promise.resolve(false);
    }

    row.usedAt = at;

    return Promise.resolve(true);
  }

  applyPasswordReset(input: {
    accountId: string;
    passwordHash: string;
    emailFingerprint: string;
    failuresSince: Date;
  }): Promise<{ sessions: number; families: number }> {
    this.applied.push(input);

    const closed = { sessions: this.sessions, families: this.families };

    this.sessions = 0;
    this.families = 0;

    // Les autres jetons du compte partent ; celui qui vient de servir reste.
    for (const row of [...this.rows]) {
      if (row.accountId === input.accountId && row.usedAt === null) {
        this.rows.splice(this.rows.indexOf(row), 1);
      }
    }

    return Promise.resolve(closed);
  }

  live(): StoredReset[] {
    return this.rows.filter((row) => row.usedAt === null && row.revokedAt === null);
  }
}

interface AttemptRow {
  emailFingerprint: string;
  ipFingerprint: string;
  outcome: LoginOutcome;
  purpose: LoginPurpose;
  attemptedAt: Date;
}

class MemoryAttempts implements AttemptStore {
  readonly rows: AttemptRow[] = [];
  /** Les comptages demandés, pour vérifier que les deux chemins en font autant. */
  readonly counts: { purpose: LoginPurpose; outcome: LoginOutcome; since: Date }[] = [];

  /** Pose une ligne datée, pour mesurer une fenêtre que le service ne crée pas. */
  seed(input: {
    outcome: LoginOutcome;
    purpose: LoginPurpose;
    emailFingerprint?: string;
    ipFingerprint?: string;
    attemptedAt?: Date;
  }): void {
    this.rows.push({
      emailFingerprint: input.emailFingerprint ?? fingerprintOf(KNOWN),
      ipFingerprint: input.ipFingerprint ?? fingerprintOf(IP),
      outcome: input.outcome,
      purpose: input.purpose,
      attemptedAt: input.attemptedAt ?? new Date(),
    });
  }

  /** La suppression des tentatives, mesurée là où une transaction existe. */
  deleteAttemptsWithin(_transaction: unknown, subjectFingerprints: string[]): Promise<number> {
    const before = this.rows.length;
    const kept = this.rows.filter((row) => !subjectFingerprints.includes(row.emailFingerprint));

    this.rows.length = 0;
    this.rows.push(...kept);

    return Promise.resolve(before - this.rows.length);
  }

  countFailures(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
    purpose: LoginPurpose;
  }): Promise<{ byEmail: number; byIp: number }> {
    return this.countAttempts({ ...input, outcome: 'failed' });
  }

  countAttempts(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
    purpose: LoginPurpose;
    outcome: LoginOutcome;
  }): Promise<{ byEmail: number; byIp: number }> {
    this.counts.push({ purpose: input.purpose, outcome: input.outcome, since: input.since });

    const matching = this.rows.filter(
      (row) =>
        row.outcome === input.outcome &&
        row.purpose === input.purpose &&
        row.attemptedAt >= input.since,
    );

    return Promise.resolve({
      byEmail: matching.filter((row) => row.emailFingerprint === input.emailFingerprint).length,
      byIp: matching.filter((row) => row.ipFingerprint === input.ipFingerprint).length,
    });
  }

  recordAttempt(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    outcome: LoginOutcome;
    purpose: LoginPurpose;
  }): Promise<void> {
    this.rows.push({ ...input, attemptedAt: new Date() });

    return Promise.resolve();
  }

  purgeExpired(): Promise<void> {
    return Promise.resolve();
  }
}

class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failWith: Error | undefined;
  /** Quand elle est posée, l'envoi ne se termine jamais. */
  blocked = false;

  send(message: MailMessage): Promise<void> {
    if (this.blocked) {
      return new Promise(() => {
        // Jamais résolue : c'est ainsi que se mesure le fait que la réponse
        // n'attend pas l'envoi.
      });
    }

    if (this.failWith !== undefined) {
      return Promise.reject(this.failWith);
    }

    this.sent.push(message);

    return Promise.resolve();
  }
}

class RecordingLog implements AuthLog {
  readonly lines: { object: object; message: string }[] = [];

  setContext(): void {
    // Rien : le contexte ne change pas ce que les lignes portent.
  }

  info(object: object, message: string): void {
    this.lines.push({ object, message });
  }

  warn(object: object, message: string): void {
    this.lines.push({ object, message });
  }

  /** Tout ce qui a été écrit, en une chaîne, pour y chercher une fuite. */
  dump(): string {
    return JSON.stringify(this.lines);
  }

  messages(): string[] {
    return this.lines.map((line) => line.message);
  }
}

/** L'empreinte telle que le service la calcule, pour semer des lignes. */
function fingerprintOf(value: string): string {
  return new AttemptsService(new MemoryAttempts()).keysFor(value, value).emailFingerprint;
}

/** Le jeton que porte le fragment du lien. */
function tokenOf(message: MailMessage): string {
  const found = /#([A-Za-z0-9_-]+)/.exec(message.text);
  const token = found?.[1];

  if (token === undefined) {
    throw new Error('aucun jeton dans le fragment du lien');
  }

  return token;
}

function first<Item>(items: readonly Item[], what: string): Item {
  const [found] = items;

  if (found === undefined) {
    throw new Error(`aucun ${what}`);
  }

  return found;
}

describe('la réinitialisation de mot de passe', () => {
  let accounts: MemoryAccounts;
  let resets: MemoryResets;
  let attempts: MemoryAttempts;
  let mailer: MemoryMailer;
  let log: RecordingLog;
  let service: PasswordResetService;

  beforeAll(() => {
    process.env['SECURITY_PEPPER'] = PEPPER;
    process.env['APP_BASE_URL'] = BASE_URL;
  });

  beforeEach(() => {
    accounts = new MemoryAccounts();
    resets = new MemoryResets();
    attempts = new MemoryAttempts();
    mailer = new MemoryMailer();
    log = new RecordingLog();
    service = new PasswordResetService(
      accounts,
      resets,
      new AttemptsService(attempts),
      mailer,
      log,
    );
  });

  describe("l'absence d'oracle", () => {
    it('fait le même travail avant de répondre, compte ou non', async () => {
      /*
        Le cœur de la décision : les deux chemins consultent la limitation de la
        même façon, écrivent une tentative, et lancent le même travail détaché.
        Il n'y a **pas une requête de plus pour une adresse connue** avant que
        la réponse soit rendue, donc le temps de réponse ne dit pas qui a un
        compte ici (ADR 0014).
      */
      await service.request(KNOWN, IP);

      const forKnown = {
        counts: attempts.counts.map((entry) => `${entry.purpose}/${entry.outcome}`),
        recorded: attempts.rows.map((row) => `${row.purpose}/${row.outcome}`),
        lookups: accounts.lookups.length,
      };

      attempts = new MemoryAttempts();
      accounts = new MemoryAccounts();
      service = new PasswordResetService(
        accounts,
        new MemoryResets(),
        new AttemptsService(attempts),
        new MemoryMailer(),
        new RecordingLog(),
      );

      await service.request(UNKNOWN, IP);

      expect({
        counts: attempts.counts.map((entry) => `${entry.purpose}/${entry.outcome}`),
        recorded: attempts.rows.map((row) => `${row.purpose}/${row.outcome}`),
        lookups: accounts.lookups.length,
      }).toEqual(forKnown);
      /*
        Et ce travail-là est bien celui qu'on croit : deux comptages, une
        écriture, et une seule recherche de compte, lancée mais **jamais
        attendue** par la réponse. C'est le test de l'envoyeur bloquant, juste
        en dessous, qui mesure cette non-attente.
      */
      expect(forKnown.counts).toEqual(['reset_request/succeeded', 'reset_request/succeeded']);
      expect(forKnown.recorded).toEqual(['reset_request/succeeded']);
      expect(forKnown.lookups).toBe(1);
    });

    it("n'attend pas l'envoi de l'e-mail pour répondre", async () => {
      /*
        L'envoyeur ne se termine jamais. Si la réponse l'attendait, ce test
        resterait bloqué jusqu'au délai de Vitest : c'est la mesure la plus
        nette de la garantie, et elle ne dépend d'aucun chronomètre.
      */
      mailer.blocked = true;

      await expect(service.request(KNOWN, IP)).resolves.toBeUndefined();
    });

    it("ne dit rien d'un envoi en échec", async () => {
      mailer.failWith = new Error('SMTP injoignable');

      await expect(service.request(KNOWN, IP)).resolves.toBeUndefined();
      await service.waitForDetachedWork();

      /*
        L'échec est journalisé et s'arrête là : la réponse est partie depuis
        longtemps, et la signaler dirait que cette adresse a un compte.
      */
      expect(log.messages()).toContain('envoi du lien de réinitialisation impossible');
      expect(mailer.sent).toEqual([]);
    });

    it("ne pose aucun jeton et n'envoie rien pour une adresse inconnue", async () => {
      await service.request(UNKNOWN, IP);
      await service.waitForDetachedWork();

      expect(resets.rows).toEqual([]);
      expect(mailer.sent).toEqual([]);
    });

    it("compte l'adresse soumise, et non un compte trouvé", async () => {
      /*
        Sinon une adresse inconnue ne serait pas comptée, et un 429 qui n'arrive
        que sur les comptes existants dirait lesquels existent (ADR 0010).
      */
      await service.request(UNKNOWN, IP);

      expect(attempts.rows).toEqual([
        expect.objectContaining({
          emailFingerprint: fingerprintOf(UNKNOWN),
          purpose: 'reset_request',
          outcome: 'succeeded',
        }),
      ]);
    });
  });

  describe('le jeton', () => {
    it('part dans le fragment du lien, et ne se garde que haché', async () => {
      await service.request(KNOWN, IP);
      await service.waitForDetachedWork();

      const message = first(mailer.sent, 'e-mail envoyé');
      const token = tokenOf(message);
      const row = first(resets.live(), 'jeton vivant');

      expect(message.text).toContain(`${BASE_URL}/mot-de-passe/reinitialisation#${token}`);
      expect(row.tokenHash).toBe(hashSecret(token));
      // Ni la ligne ni le journal ne portent le jeton en clair.
      expect(JSON.stringify(resets.rows)).not.toContain(token);
      expect(log.dump()).not.toContain(token);
    });

    it('expire dans une heure', async () => {
      const before = Date.now();

      await service.request(KNOWN, IP);
      await service.waitForDetachedWork();

      const row = first(resets.live(), 'jeton vivant');

      expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + RESET_TTL_MS);
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TTL_MS);
      expect(RESET_TTL_MS).toBe(HOUR_MS);
    });

    it('révoque le jeton vivant quand une nouvelle demande arrive', async () => {
      await service.request(KNOWN, IP);
      await service.waitForDetachedWork();
      await service.request(KNOWN, IP);
      await service.waitForDetachedWork();

      expect(resets.rows).toHaveLength(2);
      expect(resets.live()).toHaveLength(1);
      // Le lien qui marche est le dernier demandé.
      expect(first(resets.live(), 'jeton vivant').id).toBe('reset-2');
    });

    it("s'arrête sans second e-mail quand l'index a fait perdre la demande", async () => {
      /*
        Deux demandes simultanées : aucune des deux transactions ne voit le
        jeton de sa voisine, et l'index unique partiel en fait perdre une.
        Réessayer révoquerait un jeton tout neuf et enverrait un message dont le
        premier lien serait déjà mort (ADR 0014).
      */
      resets.failWith = uniqueViolation();

      await expect(service.request(KNOWN, IP)).resolves.toBeUndefined();
      await service.waitForDetachedWork();

      expect(mailer.sent).toEqual([]);
      expect(log.messages()).toContain('demande de réinitialisation déjà traitée par une autre');
      // Et surtout : pas de ligne d'erreur, ce conflit étant un cas normal.
      expect(log.messages()).not.toContain('envoi du lien de réinitialisation impossible');
    });
  });

  describe('la limitation', () => {
    it('refuse au-delà de trois demandes par heure et par adresse', async () => {
      for (let index = 0; index < MAX_PER_EMAIL_PER_HOUR; index += 1) {
        await service.request(KNOWN, IP);
      }

      await expect(service.request(KNOWN, IP)).rejects.toThrow(ProblemException);
      await expect(service.request(KNOWN, IP)).rejects.toThrow(/Trop de demandes/);
    });

    it('refuse au-delà de dix demandes par jour et par adresse', async () => {
      /*
        Les trois par heure bornent une rafale, pas l'acharnement : sans le
        plafond quotidien, vingt-quatre heures en donneraient soixante-douze.
      */
      for (let index = 0; index < MAX_PER_EMAIL_PER_DAY; index += 1) {
        attempts.seed({
          outcome: 'succeeded',
          purpose: 'reset_request',
          attemptedAt: new Date(Date.now() - 2 * HOUR_MS),
        });
      }

      await expect(service.request(KNOWN, IP)).rejects.toThrow(/Trop de demandes/);
    });

    it('refuse au-delà de vingt demandes par heure et par IP', async () => {
      for (let index = 0; index < MAX_PER_IP_PER_HOUR; index += 1) {
        attempts.seed({
          outcome: 'succeeded',
          purpose: 'reset_request',
          emailFingerprint: `autre-adresse-${String(index)}`,
        });
      }

      await expect(service.request(KNOWN, IP)).rejects.toThrow(/Trop de demandes/);
    });

    it('ne compte pas les refus, qui laisseraient un inconnu bloquer une adresse', async () => {
      // Trois demandes acceptées, mais vieilles de deux heures : hors fenêtre.
      for (let index = 0; index < MAX_PER_EMAIL_PER_HOUR; index += 1) {
        attempts.seed({
          outcome: 'succeeded',
          purpose: 'reset_request',
          attemptedAt: new Date(Date.now() - 2 * HOUR_MS),
        });
      }

      // Et dix refus tout frais, qui ne doivent rien prolonger.
      for (let index = 0; index < 10; index += 1) {
        attempts.seed({ outcome: 'blocked', purpose: 'reset_request' });
      }

      await expect(service.request(KNOWN, IP)).resolves.toBeUndefined();
    });

    it('compte sous son propre motif, sans toucher à la connexion', async () => {
      /*
        Les deux routes partagent l'adresse IP : compter ensemble laisserait
        quelqu'un verrouiller la connexion du vrai propriétaire, ou l'inverse
        (ADR 0012 pour `reauth`, ADR 0014 pour celui-ci).
      */
      for (let index = 0; index < 5; index += 1) {
        attempts.seed({ outcome: 'failed', purpose: 'password' });
      }

      await expect(service.request(KNOWN, IP)).resolves.toBeUndefined();
      expect(attempts.counts.every((entry) => entry.purpose === 'reset_request')).toBe(true);
    });

    it('écrit le refus, et le journalise par empreintes', async () => {
      for (let index = 0; index < MAX_PER_EMAIL_PER_HOUR; index += 1) {
        await service.request(KNOWN, IP);
      }

      await expect(service.request(KNOWN, IP)).rejects.toThrow(/Trop de demandes/);

      expect(
        attempts.rows.filter((row) => row.outcome === 'blocked' && row.purpose === 'reset_request'),
      ).toHaveLength(1);
      expect(log.messages()).toContain('demande de réinitialisation bloquée par la limitation');
      // Les empreintes, jamais l'adresse ni l'IP.
      expect(log.dump()).not.toContain(KNOWN);
      expect(log.dump()).not.toContain(IP);
    });

    it('mesure la fenêtre sur une heure et sur un jour', async () => {
      await service.request(KNOWN, IP);

      const windows = attempts.counts.map((entry) => Date.now() - entry.since.getTime());

      expect(windows.some((span) => Math.abs(span - HOUR_MS) < 1_000)).toBe(true);
      expect(windows.some((span) => Math.abs(span - DAY_MS) < 1_000)).toBe(true);
    });
  });

  describe('le nouveau mot de passe', () => {
    const TOKEN = 'un-jeton-opaque-de-test';
    const NEW_PASSWORD = 'un mot de passe tout neuf';

    it('est écrit haché, et ferme toutes les sessions et mémorisations', async () => {
      const record = resets.seed({ token: TOKEN });

      await service.reset(TOKEN, NEW_PASSWORD, IP);

      const applied = first(resets.applied, 'écriture');

      expect(applied.accountId).toBe(ACCOUNT.id);
      // Une vraie empreinte Argon2id du mot de passe choisi, pas le mot de passe.
      expect(applied.passwordHash).not.toContain(NEW_PASSWORD);
      await expect(verifyPassword(applied.passwordHash, NEW_PASSWORD)).resolves.toBe(true);
      // Les deux appareils connectés et les deux appareils mémorisés sont partis.
      expect(resets.sessions).toBe(0);
      expect(resets.families).toBe(0);
      expect(log.lines).toContainEqual({
        object: { resetId: record.id, accountId: ACCOUNT.id, sessions: 2, families: 2 },
        message: 'mot de passe réinitialisé',
      });
    });

    it("n'ouvre aucune session : l'écran renvoie vers la connexion", async () => {
      resets.seed({ token: TOKEN });

      /*
        Le service ne connaît ni `SessionService` ni les cookies, et c'est la
        garantie : rien ici ne peut ouvrir une session, donc rien ne peut
        contourner le second facteur d'un administrateur (ADR 0014).
      */
      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).resolves.toBeUndefined();
    });

    it('efface les échecs de connexion comptés sur son adresse', async () => {
      resets.seed({ token: TOKEN });

      await service.reset(TOKEN, NEW_PASSWORD, IP);

      /*
        L'empreinte de l'adresse du compte, et non celle de l'IP : sinon
        quelqu'un qui s'est trompé cinq fois avant de réinitialiser resterait
        bloqué avec son mot de passe tout neuf, et les compteurs par IP, eux,
        n'ont pas à tomber (ADR 0014).
      */
      expect(first(resets.applied, 'écriture').emailFingerprint).toBe(fingerprintOf(KNOWN));
      expect(first(resets.applied, 'écriture').emailFingerprint).not.toBe(fingerprintOf(IP));

      /*
        Et seulement ceux de la fenêtre qui bloque : les échecs plus anciens ne
        comptent plus pour personne, et les effacer ferait perdre la trace de ce
        qui s'est passé avant.
      */
      const since = first(resets.applied, 'écriture').failuresSince;

      expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(ATTEMPT_WINDOW_MS);
      expect(Date.now() - since.getTime()).toBeLessThan(ATTEMPT_WINDOW_MS + 5_000);
    });

    it('consomme le jeton, qui ne sert donc pas deux fois', async () => {
      resets.seed({ token: TOKEN });

      await service.reset(TOKEN, NEW_PASSWORD, IP);

      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).rejects.toThrow(/plus valable/);
      expect(resets.applied).toHaveLength(1);
    });

    it('refuse du même refus un jeton inconnu, expiré, révoqué ou déjà utilisé', async () => {
      resets.seed({ token: 'expire', expiresAt: new Date(Date.now() - 1_000) });
      resets.seed({ token: 'revoque', revokedAt: new Date(), accountId: ACCOUNT.id });
      resets.seed({ token: 'utilise', usedAt: new Date(), accountId: ACCOUNT.id });

      for (const token of ['inconnu', 'expire', 'revoque', 'utilise']) {
        const refusal = await service
          .reset(token, NEW_PASSWORD, IP)
          .catch((error: unknown) => error);

        expect(refusal, token).toBeInstanceOf(ProblemException);
        expect(refusal, token).toHaveProperty('status', 410);
        expect(String(refusal), token).toContain(
          "Ce lien n'est plus valable. Demandez une nouvelle réinitialisation.",
        );
      }

      expect(resets.applied).toEqual([]);
    });

    it("n'écrit rien quand la consommation est perdue par une soumission simultanée", async () => {
      /*
        L'écriture conditionnelle est ce qui tranche entre deux soumissions du
        même lien : la seconde ne modifie aucune ligne, et elle est refusée
        avant d'avoir rien écrit.
      */
      resets.seed({ token: TOKEN });
      resets.consumeFails = true;

      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).rejects.toThrow(/plus valable/);
      expect(resets.applied).toEqual([]);
    });

    it("n'attend pas la notification pour répondre", async () => {
      /*
        L'envoyeur ne se termine jamais : le mot de passe est pourtant déjà
        changé, donc la réponse n'a aucune raison d'attendre un SMTP. Ce test ne
        peut pas attendre le travail détaché, par construction : il reste en
        cours pour toujours.
      */
      resets.seed({ token: TOKEN });
      mailer.blocked = true;

      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).resolves.toBeUndefined();
      expect(resets.applied).toHaveLength(1);
    });

    it('prévient le titulaire, sans lien et sans rien décrire', async () => {
      resets.seed({ token: TOKEN });

      await service.reset(TOKEN, NEW_PASSWORD, IP);
      await service.waitForDetachedWork();

      const message = first(mailer.sent, 'notification envoyée');

      expect(message.subject).toBe('Votre mot de passe Mijote a été changé');
      expect(message.to).toBe(KNOWN);
      // Aucun lien dans une notification : ce serait le support d'un hameçonnage.
      expect(message.text).not.toMatch(/https?:\/\//);
    });

    it('ne défait rien quand la notification échoue', async () => {
      resets.seed({ token: TOKEN });
      mailer.failWith = new Error('SMTP injoignable');

      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).resolves.toBeUndefined();
      await service.waitForDetachedWork();

      expect(resets.applied).toHaveLength(1);
      expect(log.messages()).toContain('notification de changement de mot de passe impossible');
    });

    it('est limitée sous son propre motif', async () => {
      // Cinq essais ratés par quart d'heure, le sujet comme l'IP étant l'IP.
      for (let index = 0; index < 5; index += 1) {
        attempts.seed({
          outcome: 'failed',
          purpose: 'reset',
          emailFingerprint: fingerprintOf(IP),
        });
      }

      resets.seed({ token: TOKEN });

      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).rejects.toThrow(/Trop de tentatives/);
      expect(resets.applied).toEqual([]);
      // Et rien n'a été consommé : le jeton reste utilisable après le blocage.
      expect(resets.live()).toHaveLength(1);
    });

    it('ne compte pas avec la connexion ni avec la demande', async () => {
      for (let index = 0; index < 5; index += 1) {
        attempts.seed({
          outcome: 'failed',
          purpose: 'password',
          emailFingerprint: fingerprintOf(IP),
        });
        attempts.seed({
          outcome: 'succeeded',
          purpose: 'reset_request',
          emailFingerprint: fingerprintOf(IP),
        });
      }

      resets.seed({ token: TOKEN });

      await expect(service.reset(TOKEN, NEW_PASSWORD, IP)).resolves.toBeUndefined();
    });

    it('compte un refus, pour que les essais ne soient pas sans borne', async () => {
      await expect(service.reset('inconnu', NEW_PASSWORD, IP)).rejects.toThrow(/plus valable/);

      expect(
        attempts.rows.filter((row) => row.purpose === 'reset' && row.outcome === 'failed'),
      ).toHaveLength(1);
    });

    it("ne journalise ni le jeton, ni le mot de passe, ni l'adresse", async () => {
      resets.seed({ token: TOKEN });

      await service.reset(TOKEN, NEW_PASSWORD, IP);
      await service.waitForDetachedWork();

      expect(log.dump()).not.toContain(TOKEN);
      expect(log.dump()).not.toContain(NEW_PASSWORD);
      expect(log.dump()).not.toContain(KNOWN);
      expect(log.dump()).not.toContain(fingerprintOf(KNOWN));
    });
  });

  describe('les journaux', () => {
    it("ne portent ni le jeton, ni l'adresse, ni son empreinte sur le chemin normal", async () => {
      await service.request(KNOWN, IP);
      await service.waitForDetachedWork();

      const token = tokenOf(first(mailer.sent, 'e-mail envoyé'));

      expect(log.dump()).not.toContain(token);
      expect(log.dump()).not.toContain(KNOWN);
      /*
        Pas l'empreinte non plus : avec elle sur la demande et l'identifiant du
        compte sur l'envoi, le même identifiant de requête relierait les deux,
        et qui détient le poivre confirmerait qu'une adresse devinée a un compte
        ici (ADR 0014).
      */
      expect(log.dump()).not.toContain(fingerprintOf(KNOWN));
      expect(log.lines).toEqual([
        {
          object: { resetId: 'reset-1', accountId: ACCOUNT.id },
          message: 'lien de réinitialisation envoyé',
        },
      ]);
    });
  });
});
