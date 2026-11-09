import { beforeEach, describe, expect, it } from 'vitest';

import { AttemptsService, type AttemptStore } from './attempts.service.js';
import type { LoginOutcome } from './auth.repository.js';

/*
  Un poivre de test, fait de zéros. Ce n'est pas un secret : il ne protège rien
  ici, et le vrai vit dans le .env, que ce dépôt ne lit jamais (security.md).
*/
const PEPPER = Buffer.alloc(32).toString('base64');

interface AttemptRow {
  emailFingerprint: string;
  ipFingerprint: string;
  outcome: LoginOutcome;
  attemptedAt: Date;
}

/** La table `login_attempt`, réduite à ce que la limitation en fait. */
class MemoryAttempts implements AttemptStore {
  readonly rows: AttemptRow[] = [];
  purged: { now: Date; attemptRetention: Date } | undefined;
  lastSince: Date | undefined;

  countFailures(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
  }): Promise<{ byEmail: number; byIp: number }> {
    return this.countAttempts({ ...input, outcome: 'failed' });
  }

  countAttempts(input: {
    emailFingerprint: string;
    ipFingerprint: string;
    since: Date;
    outcome: LoginOutcome;
  }): Promise<{ byEmail: number; byIp: number }> {
    this.lastSince = input.since;

    const matching = this.rows.filter(
      (row) => row.outcome === input.outcome && row.attemptedAt >= input.since,
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
  }): Promise<void> {
    this.rows.push({ ...input, attemptedAt: new Date() });

    return Promise.resolve();
  }

  purgeExpired(now: Date, attemptRetention: Date): Promise<void> {
    this.purged = { now, attemptRetention };

    return Promise.resolve();
  }
}

let store: MemoryAttempts;
let attempts: AttemptsService;

beforeEach(() => {
  process.env['SECURITY_PEPPER'] = PEPPER;
  store = new MemoryAttempts();
  attempts = new AttemptsService(store);
});

describe('keysFor', () => {
  it("ne garde ni l'adresse ni l'IP, mais compte toujours la même sous la même clé", () => {
    const keys = attempts.keysFor('martin@exemple.test', '203.0.113.7');

    expect(keys).toEqual(attempts.keysFor('martin@exemple.test', '203.0.113.7'));
    expect(JSON.stringify(keys)).not.toContain('exemple');
    expect(JSON.stringify(keys)).not.toContain('203.0.113');
    expect(keys.emailFingerprint).not.toBe(keys.ipFingerprint);
  });

  it('sépare deux adresses et deux IP', () => {
    const one = attempts.keysFor('martin@exemple.test', '203.0.113.7');
    const two = attempts.keysFor('autre@exemple.test', '203.0.113.8');

    expect(one.emailFingerprint).not.toBe(two.emailFingerprint);
    expect(one.ipFingerprint).not.toBe(two.ipFingerprint);
  });
});

describe('isBlocked', () => {
  it('laisse passer quatre échecs sur une adresse, bloque au cinquième', async () => {
    const keys = attempts.keysFor('martin@exemple.test', '203.0.113.7');

    for (let count = 0; count < 4; count += 1) {
      await attempts.record(keys, 'failed');
    }

    expect(await attempts.isBlocked(keys)).toBe(false);

    await attempts.record(keys, 'failed');

    expect(await attempts.isBlocked(keys)).toBe(true);
  });

  it('bloque une IP qui essaie vingt adresses différentes', async () => {
    const ip = '203.0.113.7';

    for (let count = 0; count < 20; count += 1) {
      await attempts.record(attempts.keysFor(`compte${String(count)}@exemple.test`, ip), 'failed');
    }

    // Une adresse de plus depuis cette IP, jamais essayée : bloquée quand même.
    expect(await attempts.isBlocked(attempts.keysFor('jamais@exemple.test', ip))).toBe(true);
    // Depuis une autre IP, la même adresse passe : c'est bien l'IP qui compte.
    expect(await attempts.isBlocked(attempts.keysFor('jamais@exemple.test', '198.51.100.4'))).toBe(
      false,
    );
  });

  it('ne compte pas les blocages, pour ne pas prolonger un blocage sans fin', async () => {
    /*
      Sinon un inconnu tiendrait un compte fermé en insistant : chaque refus
      ajouterait une ligne qui repousse la fin de la fenêtre.
    */
    const keys = attempts.keysFor('martin@exemple.test', '203.0.113.7');

    for (let count = 0; count < 10; count += 1) {
      await attempts.record(keys, 'blocked');
    }

    expect(await attempts.isBlocked(keys)).toBe(false);
  });

  it('ne compte pas les échecs plus vieux que la fenêtre', async () => {
    const keys = attempts.keysFor('martin@exemple.test', '203.0.113.7');

    for (let count = 0; count < 5; count += 1) {
      await attempts.record(keys, 'failed');
    }

    // La fenêtre demandée est bien glissante, et large de quinze minutes.
    await attempts.isBlocked(keys);

    const since = store.lastSince?.getTime() ?? 0;

    expect(Date.now() - since).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(Date.now() - since).toBeLessThan(15 * 60 * 1000 + 1_000);

    for (const row of store.rows) {
      row.attemptedAt = new Date(Date.now() - 16 * 60 * 1000);
    }

    expect(await attempts.isBlocked(keys)).toBe(false);
  });

  it('refuse de démarrer sans poivre, plutôt que de compter sans clé', () => {
    delete process.env['SECURITY_PEPPER'];

    expect(() => new AttemptsService(store)).toThrow(/SECURITY_PEPPER/);
  });
});

describe('purge', () => {
  it('garde les tentatives un jour, bien après la fenêtre de limitation', async () => {
    await attempts.purge();

    const retention = store.purged?.attemptRetention.getTime() ?? 0;
    const elapsed = (store.purged?.now.getTime() ?? 0) - retention;

    expect(elapsed).toBe(24 * 60 * 60 * 1000);
  });
});
