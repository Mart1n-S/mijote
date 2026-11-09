// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';
import { isAuthenticated, resetSessionForTests } from '../session/session';

import ResetPasswordPage from './ResetPasswordPage.vue';

/*
  Le choix du nouveau mot de passe : ce que la page fait du jeton, ce qu'elle
  demande, et où elle mène.

  Deux points s'y mesurent, et ils viennent de l'ADR 0014 : le jeton quitte la
  barre d'adresse avant tout appel, et **aucune session n'est ouverte** au bout,
  l'écran renvoyant vers la connexion.

  Le parcours dans un vrai navigateur, avec axe-core, vit dans
  e2e/password-reset.spec.ts.
*/

const TOKEN = 'un-jeton-opaque-de-trente-deux-octets';
const PASSWORD = 'un mot de passe tout neuf';

function done(): Response {
  return new Response(null, { status: 204 });
}

/** La réponse de /auth/session après la réinitialisation : plus personne. */
function anonymous(): Response {
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

/** Le refus unique d'un lien inconnu, expiré, révoqué ou déjà utilisé. */
function unusable(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Ressource disparue',
      status: 410,
      detail: "Ce lien n'est plus valable. Demandez une nouvelle réinitialisation.",
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 410, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

let calls: { path: string; init: RequestInit | undefined }[];

function stubResponses(responses: Response[]): void {
  const queue = [...responses];

  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      calls.push({ path, init });

      const next = queue.shift();

      if (next === undefined) {
        throw new Error('un appel de plus que prévu');
      }

      return Promise.resolve(next);
    }),
  );
}

function bodyOf(index: number): Record<string, unknown> {
  const body = calls[index]?.init?.body;

  if (typeof body !== 'string') {
    throw new Error(`l'appel ${String(index)} n'a pas de corps JSON`);
  }

  const parsed: unknown = JSON.parse(body);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error("le corps n'est pas un objet");
  }

  return { ...parsed };
}

let router: Router;

async function mountPage(hash: string): Promise<VueWrapper> {
  router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push('/mot-de-passe/reinitialisation');
  await router.isReady();

  /*
    Le fragment est lu dans `window.location`, et non dans la route : c'est le
    navigateur qui le porte, et vue-router n'a pas à le voir passer.
  */
  window.location.hash = hash;

  const wrapper = mount(ResetPasswordPage, {
    attachTo: document.body,
    global: { plugins: [router] },
  });

  await flushPromises();

  return wrapper;
}

/** Saisit le mot de passe et soumet. */
async function save(wrapper: VueWrapper, password: string): Promise<void> {
  await wrapper.find('input[type="password"]').setValue(password);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
  document.body.innerHTML = '';
});

describe('ResetPasswordPage', () => {
  it("efface le jeton de l'adresse, sans rien appeler avant la soumission", async () => {
    stubResponses([]);

    const wrapper = await mountPage(`#${TOKEN}`);

    /*
      Rien n'est appelé au montage, contrairement à la page d'invitation : il
      n'y a aucun aperçu à montrer, donc aucune route publique de plus à garder
      et à limiter (ADR 0014).
    */
    expect(calls).toHaveLength(0);
    // Et le jeton ne reste pas dans la barre d'adresse.
    expect(window.location.hash).toBe('');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('ne demande que le mot de passe, en nouveau', async () => {
    stubResponses([]);

    const wrapper = await mountPage(`#${TOKEN}`);

    expect(wrapper.find('h1').text()).toBe('Nouveau mot de passe');
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'Nouveau mot de passe (obligatoire)',
    ]);
    expect(wrapper.find('input[type="password"]').attributes('autocomplete')).toBe('new-password');
    // La règle de longueur est dite avant la saisie, pas seulement après.
    expect(wrapper.text()).toContain('12 caractères au moins');
  });

  it('refuse un mot de passe trop court sans appeler le serveur', async () => {
    stubResponses([]);

    const wrapper = await mountPage(`#${TOKEN}`);

    await save(wrapper, 'court');

    expect(calls).toHaveLength(0);
    expect(wrapper.text()).toContain('12 caractères au moins');
  });

  it('envoie le jeton dans le corps, puis renvoie vers la connexion', async () => {
    stubResponses([done(), anonymous()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    await save(wrapper, PASSWORD);

    // Le jeton part dans le corps, jamais dans l'adresse appelée.
    expect(calls[0]?.path).toBe('/api/auth/password/reset');
    expect(calls[0]?.path).not.toContain(TOKEN);
    expect(bodyOf(0)).toEqual({ token: TOKEN, password: PASSWORD });

    /*
      Aucune session ouverte : on vient de fermer toutes celles du compte, et
      l'écran conduit à la connexion. La page relit la session pour que
      l'en-tête n'affiche plus un compte dont la session est morte.
    */
    expect(calls[1]?.path).toBe('/api/auth/session');
    expect(isAuthenticated.value).toBe(false);
    expect(wrapper.text()).toContain('Votre mot de passe est à jour');
    expect(wrapper.find('a[href="/connexion"]').exists()).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it("montre le refus unique d'un lien qui ne vaut plus rien", async () => {
    stubResponses([unusable()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    await save(wrapper, PASSWORD);

    /*
      Le même message pour un lien inconnu, expiré, révoqué ou déjà utilisé :
      les distinguer dirait à qui a trouvé un vieux lien que sa cible s'en est
      servie.
    */
    expect(wrapper.text()).toContain("Ce lien n'est plus valable.");
    expect(wrapper.find('a[href="/mot-de-passe-oublie"]').exists()).toBe(true);
  });

  it("dit quoi faire quand l'adresse ne porte aucun jeton", async () => {
    stubResponses([]);

    const wrapper = await mountPage('');

    expect(calls).toHaveLength(0);
    expect(wrapper.text()).toContain('Ce lien est incomplet.');
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('a[href="/mot-de-passe-oublie"]').exists()).toBe(true);
  });
});
