import type { HouseholdProfile } from '@mijote/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Authenticated } from '../auth/session.service.js';
import type { Transaction } from '../db/client.js';
import { ProblemException } from '../errors/problem.exception.js';

import {
  type AccountGateway,
  type AttemptsGateway,
  type ConfirmationGateway,
  type HouseholdGateway,
  type InvitationGateway,
  PrivacyService,
  type PrivacyLog,
  type TransactionRunner,
} from './privacy.service.js';

/*
  L'export et la suppression sans HTTP et sans PostgreSQL.

  C'est ici que se mesure **le refus du dernier administrateur**, et c'est
  volontaire : la propriété est globale à la base, et la base de test est
  partagée par les fichiers qui tournent en parallèle, chacun créant ses propres
  administrateurs. Seul un magasin en mémoire permet de dire « il n'en reste
  qu'un » (voir privacy.integration.spec.ts).

  Ce que le SQL seul peut dire, à savoir qu'il ne reste rien après une
  suppression, se mesure là-bas.
*/

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const HOUSEHOLD_ID = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'titulaire@exemple.test';
const IP = '203.0.113.70';

/*
  La transaction n'est qu'un jeton passé aux magasins, qui l'ignorent : ce faux
  n'a donc rien à implémenter. L'assertion de type est assumée ici, un objet de
  transaction de Drizzle n'étant pas reproductible à la main.
*/
const NO_TRANSACTION = {} as Transaction;

const PROFILE: HouseholdProfile = {
  name: 'Chez moi',
  peopleCount: 2,
  goal: 'balance',
  monthlyBudgetCents: 18_000,
  maxMealMinutes: 30,
  varietyBalance: 'reuse',
  allergens: ['milk'],
  diets: [],
  excludedIngredients: ['coriandre'],
  onboardingDone: true,
};

function authenticatedAs(role: 'user' | 'admin'): Authenticated {
  return {
    account: {
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      email: EMAIL,
      passwordHash: '$argon2id$peu importe',
      role,
    },
    session: {
      id: '33333333-3333-4333-8333-000000000001',
      accountId: ACCOUNT_ID,
      csrfSecret: 'peu importe',
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      adminUnlockedAt: null,
    },
  };
}

/** Ce que chaque magasin a fait, dans l'ordre : c'est ce qui dit quoi avant quoi. */
let calls: string[];

class MemoryAccounts implements AccountGateway {
  admins = 2;

  detailsOf(accountId: string) {
    return Promise.resolve(
      accountId === ACCOUNT_ID
        ? { id: ACCOUNT_ID, email: EMAIL, role: 'user' as const, createdAt: new Date(0) }
        : undefined,
    );
  }

  lockAdminsWithin(): Promise<number> {
    calls.push('verrou');

    return Promise.resolve(this.admins);
  }
}

class MemoryConfirmation implements ConfirmationGateway {
  passwordFails: Error | undefined;
  codeFails: Error | undefined;

  requirePassword(): Promise<void> {
    calls.push('mot de passe');

    return this.passwordFails === undefined
      ? Promise.resolve()
      : Promise.reject(this.passwordFails);
  }

  requireSecondFactor(): Promise<void> {
    calls.push('code');

    return this.codeFails === undefined ? Promise.resolve() : Promise.reject(this.codeFails);
  }

  exportSecurity() {
    return Promise.resolve({
      twoFactor: {
        active: true,
        activatedAt: '2026-11-01T10:00:00.000Z',
        backupCodeCount: 10,
        usedBackupCodes: [3],
      },
      devices: {
        sessions: [
          {
            createdAt: '2026-11-10T10:00:00.000Z',
            lastSeenAt: '2026-11-10T11:00:00.000Z',
            expiresAt: '2026-11-10T22:00:00.000Z',
          },
        ],
        remembered: [
          { createdAt: '2026-11-10T10:00:00.000Z', expiresAt: '2026-12-10T10:00:00.000Z' },
        ],
      },
    });
  }
}

class MemoryHouseholds implements HouseholdGateway {
  exportable() {
    return Promise.resolve({ createdAt: '2026-10-01T08:00:00.000Z', profile: PROFILE });
  }

  deleteWithin(): Promise<number> {
    calls.push('foyer');

    return Promise.resolve(1);
  }
}

class MemoryInvitations implements InvitationGateway {
  exportableFor() {
    return Promise.resolve({
      createdAt: '2026-09-01T08:00:00.000Z',
      usedAt: '2026-09-02T09:00:00.000Z',
      role: 'user' as const,
    });
  }

  deleteForEmailWithin(): Promise<number> {
    calls.push('invitations');

    return Promise.resolve(1);
  }
}

class MemoryAttempts implements AttemptsGateway {
  forgetWithin(): Promise<number> {
    calls.push('tentatives');

    return Promise.resolve(2);
  }
}

/** La transaction est jouée tout de suite : ce qui compte est qu'il n'y en ait qu'une. */
class OneTransaction implements TransactionRunner {
  opened = 0;

  async transaction<Result>(run: (transaction: Transaction) => Promise<Result>): Promise<Result> {
    this.opened += 1;

    return run(NO_TRANSACTION);
  }
}

class RecordingLog implements PrivacyLog {
  readonly lines: { object: object; message: string }[] = [];

  setContext(): void {
    // Rien : le contexte ne change pas ce que les lignes portent.
  }

  info(object: object, message: string): void {
    this.lines.push({ object, message });
  }

  dump(): string {
    return JSON.stringify(this.lines);
  }
}

let accounts: MemoryAccounts;
let confirmation: MemoryConfirmation;
let households: MemoryHouseholds;
let invitations: MemoryInvitations;
let attempts: MemoryAttempts;
let runner: OneTransaction;
let log: RecordingLog;
let service: PrivacyService;

beforeEach(() => {
  calls = [];
  accounts = new MemoryAccounts();
  confirmation = new MemoryConfirmation();
  households = new MemoryHouseholds();
  invitations = new MemoryInvitations();
  attempts = new MemoryAttempts();
  runner = new OneTransaction();
  log = new RecordingLog();
  service = new PrivacyService(
    accounts,
    attempts,
    runner,
    confirmation,
    households,
    invitations,
    log,
  );
});

describe("l'export", () => {
  it("assemble le compte, le foyer, la sécurité et l'invitation", async () => {
    const exported = await service.export(authenticatedAs('user'));

    expect(exported.format).toBe(1);
    expect(exported.account.email).toBe(EMAIL);
    expect(exported.household.profile.allergens).toEqual(['milk']);
    expect(exported.twoFactor.usedBackupCodes).toEqual([3]);
    expect(exported.devices.sessions).toHaveLength(1);
    expect(exported.invitation?.role).toBe('user');
  });

  it("ne journalise que l'identifiant du compte", async () => {
    await service.export(authenticatedAs('user'));

    expect(log.lines).toEqual([{ object: { accountId: ACCOUNT_ID }, message: 'export demandé' }]);
    // Rien du contenu : un export journalisé en détail ferait du journal une
    // seconde copie du fichier (ADR 0017).
    expect(log.dump()).not.toContain(EMAIL);
    expect(log.dump()).not.toContain('milk');
    expect(log.dump()).not.toContain('Chez moi');
  });
});

describe('la suppression', () => {
  it('exige le mot de passe et le code avant toute écriture', async () => {
    await service.delete(authenticatedAs('user'), { password: 'un mot de passe' }, IP);

    expect(calls).toEqual(['mot de passe', 'code', 'invitations', 'tentatives', 'foyer']);
  });

  it("n'écrit rien quand le mot de passe est refusé", async () => {
    confirmation.passwordFails = new ProblemException(401, 'Mot de passe incorrect.');

    await expect(
      service.delete(authenticatedAs('user'), { password: 'pas le bon' }, IP),
    ).rejects.toThrow(/Mot de passe/);

    expect(calls).toEqual(['mot de passe']);
    expect(runner.opened).toBe(0);
  });

  it("n'écrit rien quand le code est refusé", async () => {
    confirmation.codeFails = new ProblemException(401, 'Code incorrect ou expiré.');

    await expect(
      service.delete(authenticatedAs('user'), { password: 'un mot de passe', code: '000000' }, IP),
    ).rejects.toThrow(/Code/);

    expect(calls).toEqual(['mot de passe', 'code']);
    expect(runner.opened).toBe(0);
  });

  it('tient dans une seule transaction', async () => {
    await service.delete(authenticatedAs('user'), { password: 'un mot de passe' }, IP);

    expect(runner.opened).toBe(1);
  });

  it('refuse le dernier administrateur, et dit par où passer', async () => {
    accounts.admins = 1;

    const refusal = await service
      .delete(authenticatedAs('admin'), { password: 'un mot de passe', code: '123456' }, IP)
      .catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ProblemException);
    expect(refusal).toHaveProperty('status', 409);
    /*
      Le message nomme le seul chemin qui existe avant l'issue #48 : aucun écran
      ne change le rôle d'un compte, et c'est l'invitation qui porte le rôle.
    */
    expect(String(refusal)).toContain('Invitez un compte avec le rôle administrateur');
  });

  it('refuse avant la moindre suppression, derrière le verrou', async () => {
    accounts.admins = 1;

    await service
      .delete(authenticatedAs('admin'), { password: 'un mot de passe', code: '123456' }, IP)
      .catch(() => undefined);

    /*
      Le verrou est pris, et rien n'est supprimé : lever dans la transaction
      annule ce qui précède, et c'est ce qui empêche deux suppressions
      simultanées de laisser l'application sans administrateur (ADR 0017).
    */
    expect(calls).toEqual(['mot de passe', 'code', 'verrou']);
    expect(log.lines).toEqual([]);
  });

  it('laisse partir un administrateur quand il en reste un autre', async () => {
    accounts.admins = 2;

    await service.delete(authenticatedAs('admin'), { password: 'un mot de passe' }, IP);

    expect(calls).toEqual(['mot de passe', 'code', 'verrou', 'invitations', 'tentatives', 'foyer']);
  });

  it('ne prend le verrou que pour un administrateur', async () => {
    // Un compte ordinaire ne peut pas être le dernier administrateur : rien à
    // verrouiller, et rien à faire attendre aux autres.
    await service.delete(authenticatedAs('user'), { password: 'un mot de passe' }, IP);

    expect(calls).not.toContain('verrou');
  });

  it('rend les quatre cookies à effacer', async () => {
    const deleted = await service.delete(
      authenticatedAs('user'),
      { password: 'un mot de passe' },
      IP,
    );

    expect(deleted.cookies).toHaveLength(4);

    for (const cookie of deleted.cookies) {
      expect(cookie).toContain('Max-Age=0');
    }
  });

  it('journalise des identifiants et des nombres, et rien de plus', async () => {
    await service.delete(authenticatedAs('user'), { password: 'un mot de passe' }, IP);

    expect(log.lines).toEqual([
      {
        object: {
          accountId: ACCOUNT_ID,
          householdId: HOUSEHOLD_ID,
          invitations: 1,
          attempts: 2,
          households: 1,
        },
        message: 'compte supprimé',
      },
    ]);
    expect(log.dump()).not.toContain(EMAIL);
    expect(log.dump()).not.toContain('Chez moi');
  });
});
