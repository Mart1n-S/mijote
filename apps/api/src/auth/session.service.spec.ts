import { beforeEach, describe, expect, it } from 'vitest';

import { hashSecret } from '../security/tokens.js';

import { ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS } from './auth.cookies.js';
import type { AccountRecord, SessionRecord } from './auth.repository.js';
import { SessionService, type SessionStore } from './session.service.js';

const ACCOUNT: AccountRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: '22222222-2222-4222-8222-222222222222',
  email: 'martin@exemple.test',
  passwordHash: '$argon2id$peu-importe',
  role: 'user',
};

/** La table `session`, réduite à ce que le service en fait. */
class MemorySessions implements SessionStore {
  readonly rows = new Map<string, SessionRecord>();
  readonly deleted: string[] = [];
  readonly touched: { id: string; seenAt: Date }[] = [];

  createSession(input: {
    accountId: string;
    tokenHash: string;
    csrfSecret: string;
    adminUnlockedAt?: Date;
    expiresAt: Date;
  }): Promise<SessionRecord> {
    const row: SessionRecord = {
      id: `session-${String(this.rows.size)}`,
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

    return Promise.resolve(session === undefined ? undefined : { session, account: ACCOUNT });
  }

  touchSession(id: string, seenAt: Date): Promise<void> {
    this.touched.push({ id, seenAt });

    return Promise.resolve();
  }

  deleteSession(id: string): Promise<void> {
    this.deleted.push(id);

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

  /** Vieillit la seule ligne présente, pour mesurer les deux limites. */
  age(lastSeenMs: number, expiresInMs: number): void {
    for (const [hash, row] of this.rows) {
      this.rows.set(hash, {
        ...row,
        lastSeenAt: new Date(Date.now() - lastSeenMs),
        expiresAt: new Date(Date.now() + expiresInMs),
      });
    }
  }
}

let store: MemorySessions;
let service: SessionService;

beforeEach(() => {
  store = new MemorySessions();
  service = new SessionService(store);
});

describe('open', () => {
  it("n'écrit que l'empreinte du jeton, jamais le jeton", async () => {
    const { token, csrfSecret } = await service.open(ACCOUNT.id);

    expect(store.rows.has(hashSecret(token))).toBe(true);
    expect([...store.rows.keys()]).not.toContain(token);
    // Deux secrets tirés séparément : le jeton CSRF est lisible par le script,
    // le jeton de session ne doit surtout pas s'en déduire.
    expect(csrfSecret).not.toBe(token);
  });

  it('pose la limite absolue à douze heures', async () => {
    const { token } = await service.open(ACCOUNT.id);
    const row = store.rows.get(hashSecret(token));

    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + ABSOLUTE_TIMEOUT_MS - 5_000);
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ABSOLUTE_TIMEOUT_MS);
  });
});

describe('resolve', () => {
  it('rend la session et son compte', async () => {
    const { token } = await service.open(ACCOUNT.id);

    expect((await service.resolve(token))?.account).toEqual(ACCOUNT);
  });

  it('ignore un jeton inconnu sans rien supprimer', async () => {
    expect(await service.resolve('jeton-inconnu')).toBeUndefined();
    expect(store.deleted).toEqual([]);
  });

  it('refuse et supprime une session inactive depuis deux heures', async () => {
    const { token } = await service.open(ACCOUNT.id);

    store.age(IDLE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS);

    expect(await service.resolve(token)).toBeUndefined();
    // Supprimée tout de suite : un jeton volé n'attend pas la purge.
    expect(store.deleted).toEqual(['session-0']);
  });

  it('refuse et supprime une session passé sa limite absolue', async () => {
    const { token } = await service.open(ACCOUNT.id);

    // Active il y a une seconde, mais ouverte il y a plus de douze heures.
    store.age(1_000, -1_000);

    expect(await service.resolve(token)).toBeUndefined();
    expect(store.deleted).toEqual(['session-0']);
  });

  it("ne réécrit la dernière activité qu'une fois par minute", async () => {
    const { token } = await service.open(ACCOUNT.id);

    await service.resolve(token);

    // Rien à réécrire : la ligne vient d'être créée.
    expect(store.touched).toEqual([]);

    store.age(90_000, ABSOLUTE_TIMEOUT_MS);
    await service.resolve(token);

    expect(store.touched).toHaveLength(1);
    expect(store.touched[0]?.id).toBe('session-0');
  });
});

describe("les droits d'administration", () => {
  it('ne les ouvre pas de lui-même', async () => {
    /*
      Une session ouverte sans second facteur validé vaut pour l'application, et
      aucune route d'administration ne l'accepte : c'est ce qui permet au cookie
      de mémorisation de rouvrir l'une sans rouvrir l'autre (ADR 0012).
    */
    const { token } = await service.open(ACCOUNT.id);

    expect((await service.resolve(token))?.session.adminUnlockedAt).toBeNull();
  });

  it("les ouvre quand un code vient d'être validé", async () => {
    const unlockedAt = new Date();
    const { token } = await service.open(ACCOUNT.id, unlockedAt);

    expect((await service.resolve(token))?.session.adminUnlockedAt).toEqual(unlockedAt);
  });

  it('les ouvre aussi sur une session déjà ouverte', async () => {
    const { token } = await service.open(ACCOUNT.id);
    const opened = await service.resolve(token);

    await service.unlockAdmin(opened?.session.id ?? '');

    expect((await service.resolve(token))?.session.adminUnlockedAt).toBeInstanceOf(Date);
  });
});

describe('close', () => {
  it('supprime la session côté serveur', async () => {
    const { token } = await service.open(ACCOUNT.id);
    const resolved = await service.resolve(token);

    await service.close(resolved?.session.id ?? '');

    expect(store.deleted).toEqual(['session-0']);
  });
});
