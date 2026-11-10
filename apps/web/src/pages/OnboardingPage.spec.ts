// @vitest-environment jsdom

import type { HouseholdProfile } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { needsOnboarding, forgetOnboarding } from '../household/onboarding';
import { createRoutes } from '../routes';
import { resetSessionForTests } from '../session/session';

import OnboardingPage from './OnboardingPage.vue';

/*
  Le premier lancement : ce que chaque étape envoie, et comment on en sort.

  Le point à ne pas perdre de vue est le corps de chaque étape : elle n'envoie
  que ses propres champs, donc l'étape du budget ne fait pas voyager
  d'allergènes (ADR 0016).

  Le parcours dans un vrai navigateur, avec axe-core, vit dans
  e2e/household.spec.ts.
*/

const PROFILE: HouseholdProfile = {
  name: 'Mon foyer',
  peopleCount: null,
  goal: null,
  monthlyBudgetCents: null,
  maxMealMinutes: null,
  varietyBalance: 'reuse',
  allergens: [],
  diets: [],
  excludedIngredients: [],
  onboardingDone: false,
};

function profileResponse(overrides: Partial<HouseholdProfile> = {}): Response {
  return new Response(JSON.stringify({ ...PROFILE, ...overrides }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
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

  await router.push('/premier-lancement');
  await router.isReady();

  const wrapper = mount(OnboardingPage, {
    attachTo: document.body,
    global: { plugins: [router] },
  });

  await flushPromises();

  return wrapper;
}

/** Clique le bouton portant ce libellé. */
async function click(wrapper: VueWrapper, label: string): Promise<void> {
  const button = wrapper.findAll('button').find((item) => item.text() === label);

  if (button === undefined) {
    throw new Error(`aucun bouton « ${label} »`);
  }

  await button.trigger('click');
  await flushPromises();
}

function fieldNamed(wrapper: VueWrapper, name: string) {
  const found = wrapper.findAll('input').find((input) => input.attributes('name') === name);

  if (found === undefined) {
    throw new Error(`aucun champ nommé ${name}`);
  }

  return found;
}

beforeEach(() => {
  resetSessionForTests();
  forgetOnboarding();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('OnboardingPage', () => {
  it('commence par le foyer, et dit où on en est', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    expect(wrapper.find('h1').text()).toBe('Bienvenue sur Mijote');
    expect(wrapper.find('h2').text()).toBe('Votre foyer');
    expect(wrapper.text()).toContain('Étape 1 sur 3');
    // Et la promesse que rien n'est définitif.
    expect(wrapper.text()).toContain('Tout se modifie plus tard dans votre profil.');
  });

  it("n'envoie que les champs de l'étape", async () => {
    stubResponses([profileResponse(), profileResponse({ peopleCount: 2 })]);

    const wrapper = await mountPage();

    await fieldNamed(wrapper, 'peopleCount').setValue('2');
    await click(wrapper, 'Enregistrer et continuer');

    /*
      Le corps de la première étape, et rien d'autre : pas d'allergènes, pas de
      budget. C'est ce que permet le PATCH partiel (ADR 0016).
    */
    expect(Object.keys(bodyOf(1)).sort()).toEqual(['name', 'peopleCount']);
    expect(bodyOf(1).peopleCount).toBe(2);
    expect(wrapper.find('h2').text()).toBe('Ce que vous ne mangez pas');
  });

  it('passe une étape sans rien envoyer', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    await click(wrapper, 'Passer cette étape');

    expect(calls).toHaveLength(1);
    expect(wrapper.find('h2').text()).toBe('Ce que vous ne mangez pas');
  });

  it("n'envoie que les contraintes à la deuxième étape", async () => {
    stubResponses([profileResponse(), profileResponse()]);

    const wrapper = await mountPage();

    await click(wrapper, 'Passer cette étape');
    await click(wrapper, 'Enregistrer et continuer');

    expect(Object.keys(bodyOf(1)).sort()).toEqual(['allergens', 'diets', 'excludedIngredients']);
  });

  it('termine à la dernière étape, et entre dans l application', async () => {
    stubResponses([profileResponse(), profileResponse({ onboardingDone: true })]);

    const wrapper = await mountPage();

    await click(wrapper, 'Passer cette étape');
    await click(wrapper, 'Passer cette étape');

    expect(wrapper.find('h2').text()).toBe('Ce qui guide vos plannings');

    await click(wrapper, 'Terminer');

    const sent = bodyOf(1);

    expect(Object.keys(sent).sort()).toEqual([
      'goal',
      'maxMealMinutes',
      'monthlyBudgetCents',
      'onboardingDone',
      'varietyBalance',
    ]);
    expect(sent.onboardingDone).toBe(true);
    expect(router.currentRoute.value.path).toBe('/');
    // La garde ne doit pas y renvoyer à la navigation suivante.
    expect(needsOnboarding.value).toBe(false);
  });

  it('libère le parcours depuis n importe quelle étape', async () => {
    stubResponses([profileResponse(), profileResponse({ onboardingDone: true })]);

    const wrapper = await mountPage();

    await click(wrapper, 'Terminer plus tard');

    // Rien que la date : aucune réponse n'est inventée pour quelqu'un qui n'a
    // rien voulu remplir.
    expect(bodyOf(1)).toEqual({ onboardingDone: true });
    expect(router.currentRoute.value.path).toBe('/');
    expect(needsOnboarding.value).toBe(false);
  });

  it('garde l étape quand un champ est refusé', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    await fieldNamed(wrapper, 'peopleCount').setValue('40');
    await click(wrapper, 'Enregistrer et continuer');

    expect(calls).toHaveLength(1);
    expect(wrapper.text()).toContain('Indiquez un nombre de personnes, de 1 à 35.');
    expect(wrapper.find('h2').text()).toBe('Votre foyer');
  });
});
