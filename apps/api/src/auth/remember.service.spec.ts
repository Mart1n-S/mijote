import { beforeEach, describe, expect, it } from 'vitest';

import { hashSecret } from '../security/tokens.js';

import { REMEMBER_TTL_MS } from './auth.cookies.js';
import type { AuthLog } from './auth.log.js';
import type { RememberRecord } from './auth.repository.js';
import { REMEMBER_GRACE_MS, RememberService, type RememberStore } from './remember.service.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '33333333-3333-4333-8333-333333333333';

/** La table `remember_token`, réduite à ce que le service en fait. */
class MemoryFamilies implements RememberStore {
  readonly rows = new Map<string, RememberRecord>();
  readonly deleted: string[] = [];
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
    this.deleted.push(family);

    return Promise.resolve();
  }

  /** Recule la rotation, pour sortir du délai de grâce. */
  ageRotation(family: string, byMs: number): void {
    const row = this.rows.get(family);

    if (row !== undefined && row.rotatedAt !== null) {
      this.rows.set(family, { ...row, rotatedAt: new Date(row.rotatedAt.getTime() - byMs) });
    }
  }

  expire(family: string): void {
    const row = this.rows.get(family);

    if (row !== undefined) {
      this.rows.set(family, { ...row, expiresAt: new Date(Date.now() - 1) });
    }
  }
}

class RecordingLog implements AuthLog {
  readonly lines: { level: 'info' | 'warn'; object: object; message: string }[] = [];

  setContext(): void {
    // Le contexte n'intéresse pas ces tests.
  }

  info(object: object, message: string): void {
    this.lines.push({ level: 'info', object, message });
  }

  warn(object: object, message: string): void {
    this.lines.push({ level: 'warn', object, message });
  }
}

/** La famille et le secret que porte un cookie. */
function parts(cookie: string): { family: string; secret: string } {
  const separator = cookie.indexOf('.');

  return { family: cookie.slice(0, separator), secret: cookie.slice(separator + 1) };
}

let store: MemoryFamilies;
let log: RecordingLog;
let service: RememberService;

beforeEach(() => {
  store = new MemoryFamilies();
  log = new RecordingLog();
  service = new RememberService(store, log);
});

describe('issue', () => {
  it("n'écrit que l'empreinte du secret, et donne trente jours", async () => {
    const cookie = await service.issue(ACCOUNT_ID);
    const { family, secret } = parts(cookie);
    const row = store.rows.get(family);

    expect(row?.secretHash).toBe(hashSecret(secret));
    expect(row?.secretHash).not.toBe(secret);
    expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now() + REMEMBER_TTL_MS - 5_000);
  });
});

describe('consume', () => {
  it('rend le compte et fait tourner le secret', async () => {
    const cookie = await service.issue(ACCOUNT_ID);
    const resumed = await service.consume(cookie);
    const { family, secret } = parts(cookie);

    expect(resumed?.accountId).toBe(ACCOUNT_ID);
    // Le cookie renvoyé porte la même famille et un secret neuf.
    expect(resumed?.refreshed).not.toBe(cookie);
    expect(parts(resumed?.refreshed ?? '').family).toBe(family);

    const row = store.rows.get(family);

    expect(row?.secretHash).toBe(hashSecret(parts(resumed?.refreshed ?? '').secret));
    expect(row?.previousSecretHash).toBe(hashSecret(secret));
  });

  it('accepte le secret précédent pendant le délai de grâce, sans reposer de cookie', async () => {
    /*
      Le cas des deux onglets : les deux présentent le même cookie, le premier
      fait tourner le secret, le second arrive avec l'ancien. Sans ce délai, le
      second passerait pour un vol et fermerait la famille.
    */
    const cookie = await service.issue(ACCOUNT_ID);

    await service.consume(cookie);

    const parallel = await service.consume(cookie);

    expect(parallel?.accountId).toBe(ACCOUNT_ID);
    /*
      Aucun cookie reposé : le navigateur a déjà reçu le nouveau de la première
      requête, et lui en poser un ancien le défairait.
    */
    expect(parallel?.refreshed).toBeUndefined();
    expect(store.deleted).toEqual([]);
    expect(log.lines).toEqual([]);
  });

  it('laisse une requête sœur gagner la rotation, sans révoquer la famille', async () => {
    /*
      Deux requêtes vraiment simultanées, et non l'une après l'autre : les deux
      lisent le même secret avant qu'aucune n'écrive. C'est le cas que le délai
      de grâce ne couvre pas, puisqu'il compare au secret **précédent**, qui
      n'existe pas encore ici.

      Sans la rotation conditionnelle, les deux écriraient, le navigateur ne
      garderait qu'un seul des deux cookies, et le suivant passerait pour un
      vol : la famille serait révoquée et la personne déconnectée, sans qu'il y
      ait eu le moindre vol.
    */
    const cookie = await service.issue(ACCOUNT_ID);
    const [first, second] = await Promise.all([service.consume(cookie), service.consume(cookie)]);

    expect(first?.accountId).toBe(ACCOUNT_ID);
    expect(second?.accountId).toBe(ACCOUNT_ID);
    // Une seule rotation, donc un seul cookie reposé.
    expect(
      [first?.refreshed, second?.refreshed].filter((value) => value !== undefined),
    ).toHaveLength(1);
    expect(store.deleted).toEqual([]);
    expect(log.lines).toEqual([]);
  });

  it('révoque la famille entière quand le secret précédent revient trop tard', async () => {
    const cookie = await service.issue(ACCOUNT_ID);
    const { family, secret } = parts(cookie);

    await service.consume(cookie);
    store.ageRotation(family, REMEMBER_GRACE_MS + 1_000);

    expect(await service.consume(cookie)).toBeUndefined();
    expect(store.deleted).toEqual([family]);

    const line = log.lines.at(0);

    expect(line?.level).toBe('warn');
    expect(line?.message).toContain('rejoué');
    // Ni le secret, ni l'adresse : seulement des identifiants internes.
    expect(JSON.stringify(line?.object)).not.toContain(secret);
    expect(line?.object).toEqual({ family, accountId: ACCOUNT_ID });
  });

  it("révoque la famille sur un secret qui n'a jamais été le bon", async () => {
    const cookie = await service.issue(ACCOUNT_ID);
    const { family } = parts(cookie);

    expect(await service.consume(`${family}.secret-inventé`)).toBeUndefined();
    expect(store.deleted).toEqual([family]);
  });

  it('ignore une famille inconnue et un cookie mal formé, sans rien révoquer', async () => {
    expect(await service.consume('famille-absente.secret')).toBeUndefined();
    expect(await service.consume('sans-separateur')).toBeUndefined();
    expect(await service.consume('.secret')).toBeUndefined();
    expect(await service.consume('famille.')).toBeUndefined();

    // Rien à révoquer, donc rien à signaler : ce ne sont pas des rejeux.
    expect(store.deleted).toEqual([]);
    expect(log.lines).toEqual([]);
  });

  it('efface un jeton périmé sans crier au vol', async () => {
    const cookie = await service.issue(ACCOUNT_ID);
    const { family } = parts(cookie);

    store.expire(family);

    expect(await service.consume(cookie)).toBeUndefined();
    expect(store.deleted).toEqual([family]);
    expect(log.lines).toEqual([]);
  });
});

describe('revoke', () => {
  it('ferme la famille de cet appareil', async () => {
    const cookie = await service.issue(ACCOUNT_ID);

    await service.revoke(cookie, ACCOUNT_ID);

    expect(store.deleted).toEqual([parts(cookie).family]);
  });

  it("ne ferme pas la famille d'un autre compte", async () => {
    /*
      La famille vient d'un cookie, donc du client : un identifiant reçu du
      client n'est jamais une preuve d'appartenance (security.md). Sans ce
      contrôle, une valeur fabriquée déconnecterait l'appareil de quelqu'un
      d'autre.
    */
    const cookie = await service.issue(ACCOUNT_ID);

    await service.revoke(cookie, OTHER_ACCOUNT_ID);

    expect(store.deleted).toEqual([]);
  });
});
