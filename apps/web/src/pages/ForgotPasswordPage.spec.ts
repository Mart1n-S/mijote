// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';
import { resetSessionForTests } from '../session/session';

import ForgotPasswordPage from './ForgotPasswordPage.vue';

/*
  La demande de réinitialisation : ce qu'elle envoie, et ce qu'elle montre.

  Le point à ne pas perdre de vue est le message : il est **le même dans tous
  les cas**, et il ne dit pas si l'adresse a un compte. Le serveur garantit le
  reste, même statut et même temps (ADR 0014).

  Le parcours dans un vrai navigateur, avec axe-core, vit dans
  e2e/password-reset.spec.ts.
*/

const EMAIL = 'titulaire@exemple.test';

const SENT = 'Si un compte existe pour cette adresse, un e-mail vient de partir.';

function accepted(): Response {
  return new Response(null, { status: 202 });
}

/** Le 429 de la limitation, le seul refus que cette route puisse rendre. */
function tooMany(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Trop de requêtes',
      status: 429,
      detail: 'Trop de demandes de réinitialisation. Réessayez dans un petit moment.',
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 429, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
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

async function mountPage(): Promise<VueWrapper> {
  router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push('/mot-de-passe-oublie');
  await router.isReady();

  return mount(ForgotPasswordPage, { attachTo: document.body, global: { plugins: [router] } });
}

/** Remplit l'adresse et soumet, comme une personne le ferait. */
async function send(wrapper: VueWrapper, email: string): Promise<void> {
  await wrapper.find('input[type="email"]').setValue(email);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('ForgotPasswordPage', () => {
  it("ne demande que l'adresse, avec le champ du design system", async () => {
    const wrapper = await mountPage();

    expect(wrapper.find('h1').text()).toBe('Mot de passe oublié');
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'Adresse e-mail (obligatoire)',
    ]);
    // Le gestionnaire de mots de passe reconnaît l'identifiant du compte.
    expect(wrapper.find('input[type="email"]').attributes('autocomplete')).toBe('username');
  });

  it('envoie la demande, et montre un message qui ne dit rien du compte', async () => {
    stubResponses([accepted()]);

    const wrapper = await mountPage();

    await send(wrapper, EMAIL);

    expect(calls[0]?.path).toBe('/api/auth/password/forgot');
    expect(bodyOf(0)).toEqual({ email: EMAIL });

    /*
      Le message parle de ce qui a été fait, et non de ce qui existe : « si un
      compte existe ». C'est la contrepartie à l'écran de l'absence d'oracle.
    */
    expect(wrapper.text()).toContain(SENT);
    expect(wrapper.text()).not.toContain('Aucun compte');
    // Le formulaire disparaît : redemander aussitôt n'a pas de sens, et la
    // limitation le refuserait.
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it("normalise l'adresse avant de l'envoyer", async () => {
    stubResponses([accepted()]);

    const wrapper = await mountPage();

    /*
      Le même schéma partagé que la connexion : espaces retirés, minuscules.
      C'est la forme sous laquelle un compte se retrouve, donc la demande ne
      doit pas dépendre de la façon de taper son adresse.
    */
    await send(wrapper, '  Titulaire@Exemple.TEST  ');

    expect(bodyOf(0)).toEqual({ email: EMAIL });
  });

  it("refuse une adresse qui n'en est pas, sans appeler le serveur", async () => {
    stubResponses([]);

    const wrapper = await mountPage();

    await send(wrapper, 'pas une adresse');

    expect(calls).toHaveLength(0);
    expect(wrapper.text()).toContain('Indiquez une adresse e-mail valide.');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('montre le message de la limitation, et garde le formulaire', async () => {
    stubResponses([tooMany()]);

    const wrapper = await mountPage();

    await send(wrapper, EMAIL);

    expect(wrapper.text()).toContain('Trop de demandes de réinitialisation.');
    // Le message de retour n'est pas montré : rien n'est parti.
    expect(wrapper.text()).not.toContain(SENT);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('montre une phrase française quand le service ne répond pas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const wrapper = await mountPage();

    await wrapper.find('input[type="email"]').setValue(EMAIL);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Le service est injoignable.');
  });

  it('ramène à la connexion, avant comme après la demande', async () => {
    stubResponses([accepted()]);

    const wrapper = await mountPage();

    expect(wrapper.find('a[href="/connexion"]').exists()).toBe(true);

    await send(wrapper, EMAIL);

    expect(wrapper.find('a[href="/connexion"]').exists()).toBe(true);
  });
});
