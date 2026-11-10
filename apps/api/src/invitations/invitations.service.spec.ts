import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { CreatedAccount, NewAccount } from '../accounts/account-creation.js';
import { AttemptsService, type AttemptStore } from '../auth/attempts.service.js';
import type { AuthLog } from '../auth/auth.log.js';
import type { AccountRecord, LoginOutcome, LoginPurpose } from '../auth/auth.repository.js';
import { ProblemException } from '../errors/problem.exception.js';
import type { MailMessage, Mailer } from '../mail/mailer.js';
import { hashSecret } from '../security/tokens.js';

import type { InvitationRecord } from './invitation.repository.js';
import {
  type AccountGateway,
  InvitationsService,
  type InvitationStore,
  MAX_PER_EMAIL_PER_DAY,
  MAX_PER_INVITER_PER_HOUR,
  readTtlHours,
  statusOf,
} from './invitations.service.js';

/*
  Les invitations sans HTTP et sans PostgreSQL : le vrai service, branché sur
  des tables en mémoire. C'est ici que se mesurent le refus unique, ce que
  l'e-mail porte, ce que les journaux n'écrivent pas, et la limitation.

  Ce que le SQL seul peut dire (l'index unique partiel, l'écriture
  conditionnelle sous deux acceptations simultanées) se mesure dans
  invitations.integration.spec.ts, contre une vraie base.
*/

const PEPPER = Buffer.alloc(32).toString('base64');
const BASE_URL = 'https://mijote.local';

const EMAIL = 'invitee@exemple.test';
const PASSWORD = 'un mot de passe assez long';
const IP = '203.0.113.7';

/** Le seul refus d'un lien qui ne vaut plus rien, dans ses cinq cas. */
const UNUSABLE = "Ce lien n'est plus valable. Demandez une nouvelle invitation.";

const ADMIN: AccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  email: 'admin@exemple.test',
  passwordHash: '',
  role: 'admin',
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/*
  La ligne telle que la table la porte : son empreinte de jeton comprise.

  `InvitationRecord` ne la porte pas, et c'est voulu : le dépôt ne la rend
  jamais au service, qui n'a aucune raison de la relire. Ce test, lui, en a
  besoin pour vérifier que le jeton n'est stocké que haché.
*/
type StoredInvitation = InvitationRecord & { tokenHash: string };

class MemoryInvitations implements InvitationStore {
  readonly rows: StoredInvitation[] = [];
  purgedBefore: Date | undefined;
  private next = 0;

  /** Pose une ligne telle quelle, pour mesurer un état que le service ne crée pas. */
  seed(input: {
    token: string;
    email?: string;
    role?: 'user' | 'admin';
    createdAt?: Date;
    expiresAt?: Date;
    usedAt?: Date;
    revokedAt?: Date;
  }): StoredInvitation {
    const record: StoredInvitation = {
      id: this.id(),
      email: input.email ?? EMAIL,
      role: input.role ?? 'user',
      invitedBy: ADMIN.id,
      tokenHash: hashSecret(input.token),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 72 * HOUR_MS),
      usedAt: input.usedAt ?? null,
      revokedAt: input.revokedAt ?? null,
      createdAt: input.createdAt ?? new Date(),
    };

    this.rows.push(record);

    return record;
  }

  replaceLive(input: {
    email: string;
    role: 'user' | 'admin';
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
    at: Date;
  }): Promise<StoredInvitation> {
    for (const row of this.rows) {
      if (row.email === input.email && row.usedAt === null && row.revokedAt === null) {
        row.revokedAt = input.at;
      }
    }

    const record: StoredInvitation = {
      id: this.id(),
      email: input.email,
      role: input.role,
      invitedBy: input.invitedBy,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      revokedAt: null,
      createdAt: input.at,
    };

    this.rows.push(record);

    return Promise.resolve(record);
  }

  findUsedByEmail(email: string): Promise<InvitationRecord | undefined> {
    return Promise.resolve(
      [...this.rows].reverse().find((row) => row.email === email && row.usedAt !== null),
    );
  }

  findByTokenHash(tokenHash: string): Promise<InvitationRecord | undefined> {
    return Promise.resolve(this.rows.find((row) => row.tokenHash === tokenHash));
  }

  list(limit: number): Promise<InvitationRecord[]> {
    return Promise.resolve(
      [...this.rows]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, limit),
    );
  }

  revoke(id: string, at: Date): Promise<boolean> {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id && candidate.usedAt === null && candidate.revokedAt === null,
    );

    if (row === undefined) {
      return Promise.resolve(false);
    }

    row.revokedAt = at;

    return Promise.resolve(true);
  }

  consume(id: string, at: Date): Promise<boolean> {
    // La même condition que le vrai UPDATE, expiration comprise.
    const row = this.rows.find(
      (candidate) =>
        candidate.id === id &&
        candidate.usedAt === null &&
        candidate.revokedAt === null &&
        candidate.expiresAt.getTime() >= at.getTime(),
    );

    if (row === undefined) {
      return Promise.resolve(false);
    }

    row.usedAt = at;

    return Promise.resolve(true);
  }

  countByInviter(invitedBy: string, since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter(
        (row) => row.invitedBy === invitedBy && row.createdAt.getTime() >= since.getTime(),
      ).length,
    );
  }

  countByEmail(email: string, since: Date): Promise<number> {
    return Promise.resolve(
      this.rows.filter((row) => row.email === email && row.createdAt.getTime() >= since.getTime())
        .length,
    );
  }

  purgeFinished(before: Date): Promise<void> {
    this.purgedBefore = before;

    return Promise.resolve();
  }

  /** Des identifiants de la forme d'un UUID : le service les journalise. */
  private id(): string {
    this.next += 1;

    return `33333333-3333-4333-8333-${String(this.next).padStart(12, '0')}`;
  }
}

class MemoryAccounts implements AccountGateway {
  readonly taken = new Set<string>();
  readonly created: NewAccount[] = [];
  private next = 0;

  isEmailTaken(email: string): Promise<boolean> {
    return Promise.resolve(this.taken.has(email));
  }

  create(input: NewAccount): Promise<CreatedAccount> {
    this.created.push(input);
    this.taken.add(input.email);
    this.next += 1;

    const suffix = String(this.next).padStart(12, '0');

    return Promise.resolve({
      accountId: `44444444-4444-4444-8444-${suffix}`,
      householdId: `55555555-5555-4555-8555-${suffix}`,
    });
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
    return this.countAttempts({ ...input, outcome: 'failed' });
  }

  countAttempts(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    purpose: LoginPurpose;
    outcome: LoginOutcome;
  }): Promise<{ byEmail: number; byIp: number }> {
    const matching = this.rows.filter(
      (row) => row.outcome === input.outcome && row.purpose === input.purpose,
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
    this.rows.push(input);

    return Promise.resolve();
  }

  purgeExpired(): Promise<void> {
    return Promise.resolve();
  }
}

class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
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
}

/** Le premier élément, ou un échec qui dit ce qui manquait. */
function first<Item>(items: readonly Item[], what: string): Item {
  const [found] = items;

  if (found === undefined) {
    throw new Error(`aucun ${what}`);
  }

  return found;
}

/** Le problème levé par un appel qui doit refuser. */
async function refusalOf(run: () => Promise<unknown>): Promise<ProblemException> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ProblemException) {
      return error;
    }

    throw error;
  }

  throw new Error("l'appel n'a pas refusé");
}

/** Le jeton que porte le lien d'un e-mail envoyé. */
function tokenOf(message: MailMessage): string {
  const found = /#([A-Za-z0-9_-]+)/.exec(message.text);
  const token = found?.[1];

  if (token === undefined) {
    throw new Error('aucun jeton dans le fragment du lien');
  }

  return token;
}

describe("l'état d'une invitation", () => {
  const base: InvitationRecord = {
    id: 'peu importe',
    email: EMAIL,
    role: 'user',
    invitedBy: ADMIN.id,
    expiresAt: new Date('2026-01-02T00:00:00.000Z'),
    usedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const before = new Date('2026-01-01T12:00:00.000Z');
  const after = new Date('2026-01-03T00:00:00.000Z');

  it('se déduit des dates, sans colonne de statut', () => {
    expect(statusOf(base, before)).toBe('pending');
    expect(statusOf(base, after)).toBe('expired');
    expect(statusOf({ ...base, revokedAt: before }, before)).toBe('revoked');
    expect(statusOf({ ...base, usedAt: before }, before)).toBe('used');
  });

  it('reste « utilisée » quand elle a aussi été révoquée ou expirée', () => {
    /*
      L'ordre compte : une invitation consommée puis révoquée a bien servi, et
      c'est ce que la liste doit montrer.
    */
    expect(statusOf({ ...base, usedAt: before, revokedAt: before }, after)).toBe('used');
    expect(statusOf({ ...base, revokedAt: before }, after)).toBe('revoked');
  });
});

describe('les réglages lus au démarrage', () => {
  it('refuse une durée de vie hors bornes, et accepte le défaut', () => {
    expect(readTtlHours({})).toBe(72);
    expect(readTtlHours({ INVITATION_TTL_HOURS: '   ' })).toBe(72);
    expect(readTtlHours({ INVITATION_TTL_HOURS: '48' })).toBe(48);
    expect(() => readTtlHours({ INVITATION_TTL_HOURS: '0' })).toThrow(/entre 1 et 720/);
    expect(() => readTtlHours({ INVITATION_TTL_HOURS: '721' })).toThrow(/entre 1 et 720/);
    expect(() => readTtlHours({ INVITATION_TTL_HOURS: '1.5' })).toThrow(/entre 1 et 720/);
    expect(() => readTtlHours({ INVITATION_TTL_HOURS: 'beaucoup' })).toThrow(/entre 1 et 720/);
  });
});

describe('les invitations', () => {
  let invitations: MemoryInvitations;
  let accounts: MemoryAccounts;
  let attempts: MemoryAttempts;
  let mailer: MemoryMailer;
  let log: RecordingLog;
  let service: InvitationsService;

  beforeAll(() => {
    process.env['SECURITY_PEPPER'] = PEPPER;
    process.env['APP_BASE_URL'] = BASE_URL;
    delete process.env['INVITATION_TTL_HOURS'];
  });

  beforeEach(() => {
    invitations = new MemoryInvitations();
    accounts = new MemoryAccounts();
    attempts = new MemoryAttempts();
    mailer = new MemoryMailer();
    log = new RecordingLog();
    service = new InvitationsService(
      invitations,
      accounts,
      new AttemptsService(attempts),
      mailer,
      log,
    );
  });

  describe("l'envoi", () => {
    it('porte le jeton dans le fragment du lien, et ne le garde que haché', async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const message = first(mailer.sent, 'e-mail envoyé');
      const token = tokenOf(message);

      /*
        Le fragment, et c'est le point : un fragment n'est jamais envoyé au
        serveur, donc le jeton ne paraît ni dans l'en-tête `Referer` d'une page
        tierce, ni dans les journaux du mandataire (ADR 0013).
      */
      expect(message.text).toContain(`${BASE_URL}/invitation#${token}`);
      expect(message.html).toContain(`${BASE_URL}/invitation#${token}`);
      expect(message.to).toBe(EMAIL);

      const row = first(invitations.rows, 'invitation écrite');

      expect(row.tokenHash).toBe(hashSecret(token));
      // Nulle part en clair : la colonne porte une empreinte, et rien d'autre.
      expect(JSON.stringify(invitations.rows)).not.toContain(token);
    });

    it("ne nomme ni l'invitant ni un foyer dans le message", async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const message = first(mailer.sent, 'e-mail envoyé');

      // L'adresse de l'administrateur n'a pas à partir chez chaque invité.
      expect(message.text).not.toContain(ADMIN.email);
      expect(message.html).not.toContain(ADMIN.email);
      expect(message.subject).toBe('Invitation à rejoindre Mijote');
    });

    it("n'écrit ni le jeton ni l'adresse dans les journaux", async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const written = log.dump();

      expect(written).not.toContain(EMAIL);
      expect(written).not.toContain(tokenOf(first(mailer.sent, 'e-mail envoyé')));
      // De quoi retrouver la ligne, en revanche : son identifiant.
      expect(written).toContain(first(invitations.rows, 'invitation écrite').id);
    });

    it('refuse une adresse qui a déjà un compte, et le dit', async () => {
      accounts.taken.add(EMAIL);

      const refusal = await refusalOf(() => service.create(ADMIN, { email: EMAIL, role: 'user' }));

      /*
        Pas d'oracle ici : la route demande le rôle administrateur et son second
        facteur, et l'administrateur est justement la personne qui a besoin de
        savoir pourquoi son invitation ne part pas.
      */
      expect(refusal.getStatus()).toBe(409);
      expect(refusal.message).toBe('Un compte existe déjà pour cette adresse.');
      expect(mailer.sent).toHaveLength(0);
    });

    it('révoque la précédente invitation de la même adresse, même expirée', async () => {
      /*
        Une invitation expirée mais non révoquée occupe encore l'index unique
        partiel, dont le prédicat ne peut pas tenir compte de l'heure. C'est à
        la création de lui céder la place (ADR 0013).
      */
      const stale = invitations.seed({
        token: 'un-ancien-jeton',
        expiresAt: new Date(Date.now() - HOUR_MS),
      });

      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      expect(invitations.rows.find((row) => row.id === stale.id)?.revokedAt).not.toBeNull();
      expect(
        invitations.rows.filter((row) => row.revokedAt === null && row.usedAt === null),
      ).toHaveLength(1);
    });

    it("garde le rôle choisi, qui est le rôle dans l'application", async () => {
      const invitation = await service.create(ADMIN, { email: EMAIL, role: 'admin' });

      expect(invitation.role).toBe('admin');
      expect(invitation.status).toBe('pending');
      expect(first(invitations.rows, 'invitation écrite').role).toBe('admin');
    });

    it('refuse au-delà de dix envois par heure pour un même administrateur', async () => {
      for (let sent = 0; sent < MAX_PER_INVITER_PER_HOUR; sent += 1) {
        await service.create(ADMIN, { email: `invite${sent}@exemple.test`, role: 'user' });
      }

      const refusal = await refusalOf(() =>
        service.create(ADMIN, { email: 'un-de-trop@exemple.test', role: 'user' }),
      );

      expect(refusal.getStatus()).toBe(429);
      expect(mailer.sent).toHaveLength(MAX_PER_INVITER_PER_HOUR);
    });

    it('refuse au-delà de trois envois par jour vers une même adresse', async () => {
      for (let sent = 0; sent < MAX_PER_EMAIL_PER_DAY; sent += 1) {
        await service.create(ADMIN, { email: EMAIL, role: 'user' });
      }

      const refusal = await refusalOf(() => service.create(ADMIN, { email: EMAIL, role: 'user' }));

      /*
        La plus importante des deux limites : sans elle, notre serveur
        deviendrait un moyen d'inonder la boîte de quelqu'un.
      */
      expect(refusal.getStatus()).toBe(429);
      expect(mailer.sent).toHaveLength(MAX_PER_EMAIL_PER_DAY);
      // Et la limitation ne nomme pas l'adresse visée dans les journaux.
      expect(log.dump()).not.toContain(EMAIL);
    });

    it('efface les invitations terminées depuis longtemps', async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const purged = invitations.purgedBefore;

      if (purged === undefined) {
        throw new Error("la purge n'a pas été demandée");
      }

      // Trente jours, et accrochée à l'envoi : ces lignes portent une adresse
      // en clair, donc elles ne restent pas.
      expect(Date.now() - purged.getTime()).toBeGreaterThan(30 * DAY_MS - 5000);
      expect(Date.now() - purged.getTime()).toBeLessThan(30 * DAY_MS + 5000);
    });
  });

  describe('la révocation', () => {
    it('rend le lien inutilisable', async () => {
      const invitation = await service.create(ADMIN, { email: EMAIL, role: 'user' });
      const token = tokenOf(first(mailer.sent, 'e-mail envoyé'));

      await service.revoke(ADMIN, invitation.id);

      await expect(service.preview(token, IP)).rejects.toThrow(UNUSABLE);
      await expect(service.accept(token, PASSWORD, IP)).rejects.toThrow(UNUSABLE);
      expect(accounts.created).toHaveLength(0);
    });

    it("refuse de révoquer ce qui ne peut plus l'être", async () => {
      const used = invitations.seed({ token: 'déjà-servi', usedAt: new Date() });

      const refusal = await refusalOf(() => service.revoke(ADMIN, used.id));

      expect(refusal.getStatus()).toBe(404);
    });

    it('nomme qui a révoqué, et pas la personne invitée', async () => {
      const invitation = await service.create(ADMIN, { email: EMAIL, role: 'user' });

      await service.revoke(ADMIN, invitation.id);

      /*
        Une action d'administration est attribuée (security.md) : sans cela,
        plusieurs administrateurs partageant les invitations, une révocation
        serait inattribuable.
      */
      expect(log.dump()).toContain(ADMIN.id);
      expect(log.dump()).toContain(invitation.id);
      expect(log.dump()).not.toContain(EMAIL);
    });
  });

  describe('la lecture du lien', () => {
    it("ne dit que l'adresse invitée", async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'admin' });

      const preview = await service.preview(tokenOf(first(mailer.sent, 'e-mail envoyé')), IP);

      // Ni le rôle, ni qui a invité, ni les dates : la page n'en a pas besoin.
      expect(preview).toEqual({ email: EMAIL });
    });

    it("refuse les cinq mêmes cas que l'acceptation", async () => {
      /*
        Les mêmes cinq, et le même message : sinon l'aperçu dirait oui à un
        lien que l'acceptation refusera, et l'invité taperait un mot de passe
        pour rien.
      */
      const now = Date.now();

      invitations.seed({ token: 'expiré', expiresAt: new Date(now - HOUR_MS) });
      invitations.seed({ token: 'révoqué', revokedAt: new Date(now) });
      invitations.seed({ token: 'utilisé', usedAt: new Date(now) });
      invitations.seed({ token: 'prise', email: 'prise@exemple.test' });
      accounts.taken.add('prise@exemple.test');

      const cases = ['jamais-émis', 'expiré', 'révoqué', 'utilisé', 'prise'];

      for (const [index, token] of cases.entries()) {
        const refusal = await refusalOf(() => service.preview(token, `198.51.100.${index + 1}`));

        expect(refusal.getStatus(), token).toBe(410);
        expect(refusal.message, token).toBe(UNUSABLE);
      }
    });

    it('est bornée elle aussi, sous le même motif', async () => {
      /*
        Elle ne hache rien, mais elle lit en base pour un inconnu : la seule
        route publique sans compteur serait la seule à pouvoir être sollicitée
        sans borne.
      */
      for (let tried = 0; tried < 5; tried += 1) {
        await service.preview(`jeton-inventé-${tried}`, IP).catch(() => undefined);
      }

      const refusal = await refusalOf(() => service.preview('encore-un', IP));

      expect(refusal.getStatus()).toBe(429);
      expect(attempts.rows.every((row) => row.purpose === 'invitation')).toBe(true);
    });
  });

  describe("l'acceptation", () => {
    it('crée le compte, son foyer par défaut, et consomme le ticket', async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'admin' });

      const token = tokenOf(first(mailer.sent, 'e-mail envoyé'));
      const accepted = await service.accept(token, PASSWORD, IP);

      expect(accounts.created).toEqual([
        { email: EMAIL, password: PASSWORD, role: 'admin', householdName: 'Mon foyer' },
      ]);
      // Le service ne rend que l'identifiant : l'adresse n'a pas à traverser
      // cette frontière pour n'y servir à personne.
      expect(Object.keys(accepted)).toEqual(['accountId']);
      expect(accepted.accountId).toMatch(/^[0-9a-f-]{36}$/);
      expect(first(invitations.rows, 'invitation écrite').usedAt).not.toBeNull();
      expect(log.dump()).not.toContain(EMAIL);
      expect(log.dump()).not.toContain(PASSWORD);
    });

    it("n'accepte qu'une fois le même lien", async () => {
      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const token = tokenOf(first(mailer.sent, 'e-mail envoyé'));

      await service.accept(token, PASSWORD, IP);

      await expect(service.accept(token, PASSWORD, IP)).rejects.toThrow(UNUSABLE);
      expect(accounts.created).toHaveLength(1);
    });

    it('refuse les cinq cas avec le même message', async () => {
      const now = Date.now();

      invitations.seed({ token: 'expiré', expiresAt: new Date(now - HOUR_MS) });
      invitations.seed({ token: 'révoqué', revokedAt: new Date(now) });
      invitations.seed({ token: 'utilisé', usedAt: new Date(now) });
      invitations.seed({ token: 'prise', email: 'prise@exemple.test' });
      accounts.taken.add('prise@exemple.test');

      const cases = ['jamais-émis', 'expiré', 'révoqué', 'utilisé', 'prise'];

      for (const [index, token] of cases.entries()) {
        /*
          Le même refus, et le même code. Les distinguer dirait à qui tient le
          lien si un compte existe pour cette adresse (issue #12).

          Une IP par cas : la limitation compte par IP, et ce test mesure les
          refus, pas elle.
        */
        const refusal = await refusalOf(() =>
          service.accept(token, PASSWORD, `198.51.100.${index + 1}`),
        );

        expect(refusal.getStatus(), token).toBe(410);
        expect(refusal.message, token).toBe(UNUSABLE);
      }

      expect(accounts.created).toHaveLength(0);
    });

    it('bloque une IP après cinq essais ratés, sous son propre motif', async () => {
      for (let tried = 0; tried < 5; tried += 1) {
        await service.accept(`jeton-inventé-${tried}`, PASSWORD, IP).catch(() => undefined);
      }

      const refusal = await refusalOf(() => service.accept('encore-un', PASSWORD, IP));

      expect(refusal.getStatus()).toBe(429);
      /*
        Sous « invitation » : une acceptation ratée ne doit pas rapprocher du
        blocage de la connexion elle-même.
      */
      expect(attempts.rows.every((row) => row.purpose === 'invitation')).toBe(true);
      expect(attempts.rows.at(-1)?.outcome).toBe('blocked');
    });

    it('laisse passer une autre IP, et compte la réussite', async () => {
      for (let tried = 0; tried < 5; tried += 1) {
        await service.accept(`jeton-inventé-${tried}`, PASSWORD, IP).catch(() => undefined);
      }

      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const token = tokenOf(first(mailer.sent, 'e-mail envoyé'));

      await service.accept(token, PASSWORD, '198.51.100.42');

      expect(accounts.created).toHaveLength(1);
      expect(attempts.rows.at(-1)?.outcome).toBe('succeeded');
    });
  });

  describe('la liste', () => {
    it("montre l'état de chacune, la plus récente d'abord", async () => {
      invitations.seed({
        token: 'ancien',
        email: 'ancien@exemple.test',
        createdAt: new Date(Date.now() - DAY_MS),
        usedAt: new Date(Date.now() - DAY_MS),
      });

      await service.create(ADMIN, { email: EMAIL, role: 'user' });

      const listed = await service.list();

      expect(listed.map((invitation) => invitation.status)).toEqual(['pending', 'used']);
      expect(listed[0]?.email).toBe(EMAIL);
      // Des dates ISO, comme tout ce qui circule dans l'API.
      expect(listed[0]?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
