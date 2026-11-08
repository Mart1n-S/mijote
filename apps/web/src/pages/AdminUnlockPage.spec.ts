// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';
import { resetSessionForTests } from '../session/session';

import AdminUnlockPage from './AdminUnlockPage.vue';

/*
  L'écran de déverrouillage de l'administration : le passage d'une session
  rouverte par le cookie de mémorisation, qui vaut pour l'application mais pas
  pour l'administration (ADR 0012).
*/

const CODE = '123456';

const ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@exemple.test',
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
};

function unlocked(): Response {
  return new Response(null, { status: 204 });
}

/** La session relue après le déverrouillage. */
function session(): Response {
  return new Response(
    JSON.stringify({ account: ADMIN, twoFactor: { active: true, adminUnlocked: true } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function invalidCode(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Authentification requise',
      status: 401,
      detail: 'Code incorrect ou expiré.',
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 401, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

let calls: { path: string; body: string | undefined }[];

function stubResponses(responses: Response[]): void {
  const queue = [...responses];

  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      calls.push({ path, body: typeof init?.body === 'string' ? init.body : undefined });

      const next = queue.shift();

      if (next === undefined) {
        throw new Error('un appel de plus que prévu');
      }

      return Promise.resolve(next);
    }),
  );
}

let router: Router;

async function mountPage(next = '/administration/invitations'): Promise<VueWrapper> {
  router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push(`/administration/deverrouillage?suivant=${encodeURIComponent(next)}`);
  await router.isReady();

  return mount(AdminUnlockPage, { attachTo: document.body, global: { plugins: [router] } });
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('AdminUnlockPage', () => {
  it('ne demande que le code, en laissant un code de secours possible', async () => {
    stubResponses([]);

    const wrapper = await mountPage();

    expect(wrapper.find('h1').text()).toBe("Déverrouiller l'administration");
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual(['Code (obligatoire)']);
    // Pas de clavier limité aux chiffres : un code de secours est fait de
    // lettres, et il doit rester tapable sur mobile.
    expect(wrapper.find('input[name="code"]').attributes('inputmode')).toBeUndefined();
    expect(wrapper.find('input[name="code"]').attributes('autocomplete')).toBe('one-time-code');
  });

  it("n'appelle pas le serveur sans code", async () => {
    stubResponses([]);

    const wrapper = await mountPage();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls).toHaveLength(0);
    expect(wrapper.text()).toContain('Indiquez le code');
  });

  it('déverrouille, relit la session, et repart où on allait', async () => {
    stubResponses([unlocked(), session()]);

    const wrapper = await mountPage();

    await wrapper.find('input[name="code"]').setValue(CODE);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls[0]?.path).toBe('/api/auth/two-factor/unlock');
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ code: CODE });
    /*
      La session est relue : c'est le serveur qui dit si elle est déverrouillée,
      et l'interface ne doit pas le décider de son côté.
    */
    expect(calls[1]?.path).toBe('/api/auth/session');
    expect(router.currentRoute.value.path).toBe('/administration/invitations');
  });

  it('montre le refus du serveur, sans quitter cet écran', async () => {
    stubResponses([invalidCode()]);

    const wrapper = await mountPage();

    await wrapper.find('input[name="code"]').setValue('000000');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Le message est celui de l'API, identique pour un code faux, déjà
    // consommé ou hors plage.
    expect(wrapper.text()).toContain('Code incorrect ou expiré.');
    expect(router.currentRoute.value.name).toBe('admin-unlock');
  });

  it("ne suit pas un retour qui mène ailleurs qu'ici", async () => {
    stubResponses([unlocked(), session()]);

    const wrapper = await mountPage('https://ailleurs.example/piege');

    await wrapper.find('input[name="code"]').setValue(CODE);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Une redirection ouverte : le paramètre est recopié dans l'adresse, donc
    // sa forme est contrôlée (voir safeNextPath).
    expect(router.currentRoute.value.path).toBe('/');
  });
});
