// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';
import { isAuthenticated, resetSessionForTests } from '../session/session';

import InvitationPage from './InvitationPage.vue';

/*
  La page d'inscription par invitation : ce qu'elle fait du jeton, ce qu'elle
  demande, et ce qu'elle montre d'un lien qui ne vaut plus rien.

  Le parcours dans un vrai navigateur, avec axe-core, vit dans
  e2e/invitation.spec.ts.
*/

const TOKEN = 'un-jeton-opaque-de-trente-deux-octets';
const EMAIL = 'invitee@exemple.test';
const PASSWORD = 'un mot de passe assez long';

const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: EMAIL,
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'user',
};

function preview(): Response {
  return new Response(JSON.stringify({ email: EMAIL }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function created(): Response {
  return new Response(
    JSON.stringify({ account: ACCOUNT, twoFactor: { active: false, adminUnlocked: false } }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );
}

/** Le refus unique d'un lien expiré, révoqué, déjà utilisé ou inconnu. */
function unusable(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Ressource disparue',
      status: 410,
      detail: "Ce lien n'est plus valable. Demandez une nouvelle invitation.",
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 410, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

/** Les appels faits, pour lire ce que la page a envoyé. */
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

/** Le corps JSON d'un appel, tel que la page l'a écrit. */
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

  await router.push('/invitation');
  await router.isReady();

  /*
    Le fragment est lu dans `window.location`, et non dans la route : c'est le
    navigateur qui le porte, et vue-router n'a pas à le voir passer.
  */
  window.location.hash = hash;

  const wrapper = mount(InvitationPage, { attachTo: document.body, global: { plugins: [router] } });

  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
  document.body.innerHTML = '';
});

describe('InvitationPage', () => {
  it("échange le jeton du fragment contre un POST, et l'efface de l'adresse", async () => {
    stubResponses([preview()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    // Le jeton part dans le corps, jamais dans l'adresse appelée : une adresse
    // fuit par l'en-tête Referer et par les journaux du mandataire.
    expect(calls[0]?.path).toBe('/api/invitations/preview');
    expect(calls[0]?.path).not.toContain(TOKEN);
    expect(bodyOf(0)).toEqual({ token: TOKEN });

    // Et il ne reste pas dans la barre d'adresse.
    expect(window.location.hash).toBe('');
    expect(wrapper.text()).toContain(EMAIL);
  });

  it("ne demande que le mot de passe, l'adresse venant de l'invitation", async () => {
    stubResponses([preview()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    expect(wrapper.find('h1').text()).toBe('Créer votre compte');
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'Mot de passe (obligatoire)',
    ]);
    // Aucun champ d'adresse, visible ou caché : la changer ferait de cet écran
    // une inscription libre.
    expect(wrapper.find('input[type="email"]').exists()).toBe(false);
    expect(wrapper.find('input[name="email"]').exists()).toBe(false);
    // Le mot de passe est annoncé au gestionnaire de mots de passe, en nouveau.
    expect(wrapper.find('input[type="password"]').attributes('autocomplete')).toBe('new-password');
  });

  it('refuse un mot de passe trop court sans appeler le serveur', async () => {
    stubResponses([preview()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    await wrapper.find('input[type="password"]').setValue('court');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls).toHaveLength(1);
    expect(wrapper.text()).toContain('12 caractères au moins');
    expect(isAuthenticated.value).toBe(false);
  });

  it('crée le compte, et la session est ouverte avec lui', async () => {
    stubResponses([preview(), created()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    await wrapper.find('input[type="password"]').setValue(PASSWORD);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls[1]?.path).toBe('/api/invitations/accept');
    expect(bodyOf(1)).toEqual({ token: TOKEN, password: PASSWORD });
    expect(isAuthenticated.value).toBe(true);
    // Et on entre dans l'application, sans laisser cette page dans l'historique.
    expect(router.currentRoute.value.path).toBe('/');
  });

  it("montre le refus unique d'un lien qui ne vaut plus rien, et aucun formulaire", async () => {
    stubResponses([unusable()]);

    const wrapper = await mountPage(`#${TOKEN}`);

    expect(wrapper.text()).toContain("Ce lien n'est plus valable.");
    /*
      Pas de formulaire : il n'y a rien à réessayer, la seule issue étant une
      nouvelle invitation. Le message est le même pour un lien expiré, révoqué,
      déjà utilisé ou inconnu : les distinguer dirait si un compte existe.
    */
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('Demandez une nouvelle invitation');
  });

  it("dit quoi faire quand l'adresse ne porte aucun jeton", async () => {
    stubResponses([]);

    const wrapper = await mountPage('');

    // Aucun appel : il n'y a rien à vérifier, et le serveur n'a pas à compter
    // une tentative pour une adresse tapée à la main.
    expect(calls).toHaveLength(0);
    expect(wrapper.text()).toContain('Ce lien est incomplet.');
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
