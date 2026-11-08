// @vitest-environment jsdom
// Le client lit document.cookie pour renvoyer le jeton CSRF : la connexion et
// la déconnexion ont donc besoin d'un document.

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  currentAccount,
  ensureSessionLoaded,
  isAuthenticated,
  isTwoFactorActive,
  logIn,
  logOut,
  mustActivateTwoFactor,
  resetSessionForTests,
  submitTwoFactorCode,
} from './session';

/*
  Le module de session est partagé par toute l'application : chaque test le
  remet à zéro, et le réseau est bouchonné. Le parcours réel vit dans
  e2e/login.spec.ts et dans auth.integration.spec.ts côté API.
*/

const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'martin@exemple.test',
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'user',
};

function respondWith(responses: Response[]): void {
  const queue = [...responses];

  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const next = queue.shift();

      if (next === undefined) {
        throw new Error('un appel de plus que prévu');
      }

      return Promise.resolve(next);
    }),
  );
}

function sessionResponse(): Response {
  return new Response(JSON.stringify({ account: ACCOUNT, twoFactor: { active: false, adminUnlocked: false } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Authentification requise',
      status: 401,
      detail: 'Cette action demande une authentification.',
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 401, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureSessionLoaded', () => {
  it('retient le compte que le serveur annonce', async () => {
    respondWith([sessionResponse()]);

    await ensureSessionLoaded();

    expect(isAuthenticated.value).toBe(true);
    expect(currentAccount.value?.email).toBe(ACCOUNT.email);
  });

  it('reste anonyme sur un 401, qui est une réponse et non une panne', async () => {
    respondWith([unauthorized()]);

    await ensureSessionLoaded();

    expect(isAuthenticated.value).toBe(false);
  });

  it('reste anonyme quand le service ne répond pas', async () => {
    /*
      On ne peut pas affirmer qu'une session existe : on reste donc fermé, et
      c'est le bandeau de service qui explique la panne à l'utilisateur.
    */
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('réseau coupé'))),
    );

    await ensureSessionLoaded();

    expect(isAuthenticated.value).toBe(false);
  });

  it("n'appelle le serveur qu'une fois, même pour deux navigations", async () => {
    respondWith([sessionResponse()]);

    await Promise.all([ensureSessionLoaded(), ensureSessionLoaded()]);
    await ensureSessionLoaded();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('logIn', () => {
  it('envoie les identifiants et retient le compte', async () => {
    respondWith([sessionResponse()]);

    await logIn({ email: ACCOUNT.email, password: 'un mot de passe assez long', remember: true });

    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(isAuthenticated.value).toBe(true);

    const body: unknown = vi.mocked(fetch).mock.calls[0]?.[1]?.body;

    expect(typeof body === 'string' ? JSON.parse(body) : undefined).toEqual({
      email: ACCOUNT.email,
      password: 'un mot de passe assez long',
      remember: true,
    });
  });

  it('laisse remonter un refus, sans ouvrir de session', async () => {
    respondWith([unauthorized()]);

    await expect(
      logIn({ email: ACCOUNT.email, password: 'faux', remember: false }),
    ).rejects.toThrow();
    expect(isAuthenticated.value).toBe(false);
  });
});

describe('le second facteur', () => {
  it('ne retient aucune session quand un code est attendu', async () => {
    respondWith([
      new Response(JSON.stringify({ twoFactorRequired: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ]);

    expect(await logIn({ email: ACCOUNT.email, password: 'bon', remember: false })).toBe(
      'two-factor',
    );
    // Aucune session n'est ouverte à ce moment-là : l'attente vit côté serveur.
    expect(isAuthenticated.value).toBe(false);
  });

  it('ouvre la session quand le code est bon', async () => {
    respondWith([
      new Response(JSON.stringify({ twoFactorRequired: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      new Response(JSON.stringify({ account: ACCOUNT, twoFactor: { active: true, adminUnlocked: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ]);

    await logIn({ email: ACCOUNT.email, password: 'bon', remember: false });
    await submitTwoFactorCode('123456');

    expect(isAuthenticated.value).toBe(true);
    expect(isTwoFactorActive.value).toBe(true);
    expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toBe('/api/auth/two-factor');
  });

  it('laisse remonter un code refusé, sans ouvrir de session', async () => {
    respondWith([unauthorized()]);

    await expect(submitTwoFactorCode('000000')).rejects.toThrow();
    expect(isAuthenticated.value).toBe(false);
  });

  it("dit qu'un administrateur sans second facteur doit l'activer", async () => {
    respondWith([
      new Response(
        JSON.stringify({
          account: { ...ACCOUNT, role: 'admin' },
          twoFactor: { active: false, adminUnlocked: false },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ]);

    await ensureSessionLoaded();

    expect(mustActivateTwoFactor.value).toBe(true);
  });

  it('ne demande rien à un compte ordinaire', async () => {
    respondWith([sessionResponse()]);

    await ensureSessionLoaded();

    expect(mustActivateTwoFactor.value).toBe(false);
    expect(isTwoFactorActive.value).toBe(false);
  });
});

describe('logOut', () => {
  it('ferme la session côté serveur et oublie le compte', async () => {
    respondWith([sessionResponse(), new Response(null, { status: 204 })]);

    await logIn({ email: ACCOUNT.email, password: 'un mot de passe assez long', remember: false });
    await logOut();

    expect(fetch).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(isAuthenticated.value).toBe(false);
  });

  it("oublie le compte même si l'appel échoue", async () => {
    /*
      Laisser l'interface affirmer que quelqu'un est connecté serait pire que de
      la remettre à zéro : la requête suivante serait refusée de toute façon.
    */
    respondWith([sessionResponse()]);

    await logIn({ email: ACCOUNT.email, password: 'un mot de passe assez long', remember: false });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('réseau coupé'))),
    );

    await expect(logOut()).rejects.toThrow();
    expect(isAuthenticated.value).toBe(false);
  });
});
