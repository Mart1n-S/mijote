// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';
import { isAuthenticated, resetSessionForTests } from '../session/session';

import LoginPage from './LoginPage.vue';

/*
  La page de connexion : ce qu'elle envoie, ce qu'elle refuse d'envoyer, et ce
  qu'elle montre d'un refus. Le parcours dans un vrai navigateur, avec
  axe-core, vit dans e2e/login.spec.ts.
*/

const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'martin@exemple.test',
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'user',
};

const PASSWORD = 'un mot de passe assez long';

function stubResponse(response: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  );
}

function accepted(): Response {
  return new Response(JSON.stringify({ account: ACCOUNT }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function refused(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Authentification requise',
      status: 401,
      detail: 'Adresse e-mail ou mot de passe incorrect.',
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 401, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

let router: Router;

async function mountPage(next = '/'): Promise<VueWrapper> {
  router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push(`/connexion?suivant=${encodeURIComponent(next)}`);
  await router.isReady();

  return mount(LoginPage, { global: { plugins: [router] } });
}

/** Remplit les deux champs, comme une personne le ferait. */
async function fill(wrapper: VueWrapper, email: string, password: string): Promise<void> {
  await wrapper.find('input[type="email"]').setValue(email);
  await wrapper.find('input[type="password"]').setValue(password);
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('emploie les champs du design system, avec leurs libellés', async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('h1').text()).toBe('Connexion');
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'Adresse e-mail (obligatoire)',
      'Mot de passe (obligatoire)',
      'Se souvenir de moi',
    ]);
    // La case à cocher est celle de D2 : une vraie case, pas un div cliquable.
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
    // Le mot de passe est annoncé au gestionnaire de mots de passe.
    expect(wrapper.find('input[type="password"]').attributes('autocomplete')).toBe(
      'current-password',
    );
  });

  it("n'appelle pas le serveur quand le formulaire est vide", async () => {
    stubResponse(accepted());

    const wrapper = await mountPage();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(fetch).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Indiquez une adresse e-mail valide.');
    expect(wrapper.text()).toContain('Indiquez votre mot de passe.');
  });

  it("refuse une adresse qui n'en est pas, sans toucher au mot de passe", async () => {
    stubResponse(accepted());

    const wrapper = await mountPage();

    await fill(wrapper, 'pas une adresse', PASSWORD);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(fetch).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Indiquez une adresse e-mail valide.');
    expect(wrapper.text()).not.toContain('Indiquez votre mot de passe.');
  });

  it('envoie la mémorisation quand la case est cochée, et revient où on allait', async () => {
    stubResponse(accepted());

    const wrapper = await mountPage('/une-page');

    await fill(wrapper, ` ${ACCOUNT.email.toUpperCase()} `, PASSWORD);
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const body: unknown = vi.mocked(fetch).mock.calls[0]?.[1]?.body;

    expect(typeof body === 'string' ? JSON.parse(body) : undefined).toEqual({
      // L'adresse part normalisée par le schéma partagé, comme la base la
      // garde : la connexion ne dépend pas de la façon de taper son adresse.
      email: ACCOUNT.email,
      password: PASSWORD,
      remember: true,
    });
    expect(isAuthenticated.value).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe('/une-page');
  });

  it('montre le message du serveur sur un refus, et reste sur la page', async () => {
    stubResponse(refused());

    const wrapper = await mountPage();

    await fill(wrapper, ACCOUNT.email, 'pas le bon mot de passe');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    /*
      Le message vient de l'API, qui l'écrit exprès identique pour une adresse
      inconnue et un mot de passe faux : cet écran n'y ajoute rien qui
      distinguerait les deux cas.
    */
    expect(wrapper.find('form [role="alert"]').text()).toContain(
      'Adresse e-mail ou mot de passe incorrect.',
    );
    expect(isAuthenticated.value).toBe(false);
    expect(router.currentRoute.value.name).toBe('login');
  });

  it('montre une phrase française quand le service ne répond pas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const wrapper = await mountPage();

    await fill(wrapper, ACCOUNT.email, PASSWORD);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('form [role="alert"]').text()).toContain('injoignable');
  });

  it('laisse le bouton reprenable après un refus', async () => {
    stubResponse(refused());

    const wrapper = await mountPage();

    await fill(wrapper, ACCOUNT.email, 'faux');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // Sans cette remise à zéro, un refus condamnerait le formulaire : le bouton
    // resterait en « connexion en cours » et refuserait les clics.
    expect(wrapper.find('button').attributes('aria-disabled')).toBeUndefined();
  });
});
