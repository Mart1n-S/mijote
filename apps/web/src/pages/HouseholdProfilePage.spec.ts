// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE, type HouseholdProfile } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';
import { resetSessionForTests } from '../session/session';

import HouseholdProfilePage from './HouseholdProfilePage.vue';

/*
  Le profil du foyer : ce qu'il charge, ce qu'il envoie, et ce qu'il montre d'un
  refus.

  Le parcours dans un vrai navigateur, avec axe-core, vit dans
  e2e/household.spec.ts.
*/

const PROFILE: HouseholdProfile = {
  name: 'Chez moi',
  peopleCount: 4,
  goal: 'balance',
  monthlyBudgetCents: 18_000,
  maxMealMinutes: 30,
  varietyBalance: 'reuse',
  allergens: ['milk'],
  diets: [],
  excludedIngredients: ['coriandre'],
  onboardingDone: true,
};

function profileResponse(overrides: Partial<HouseholdProfile> = {}): Response {
  return new Response(JSON.stringify({ ...PROFILE, ...overrides }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Un refus de champ, comme le pipe de validation le rend. */
function fieldRefusal(field: string, message: string): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Requête invalide',
      status: 400,
      detail: 'La demande contient des erreurs.',
      requestId: '00000000-0000-4000-8000-000000000000',
      errors: [{ field, message }],
    }),
    { status: 400, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

let calls: { path: string; init: RequestInit | undefined }[];

function stubResponses(responses: Response[]): void {
  const queue = [...responses];

  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      /*
        La section « Mes données », montée sous le profil, demande au serveur si
        la suppression lui est fermée. Cet appel est répondu ici et n'entre pas
        dans la file : ce fichier mesure le profil, et cette section a le sien
        (AccountDataSection.spec.ts). Sans cela, chaque test devrait placer une
        réponse de plus, dans un ordre qui dépend de l'ordre des crochets de
        montage de Vue.
      */
      if (path.endsWith('/account/deletion')) {
        return Promise.resolve(
          new Response(JSON.stringify({ blocked: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }

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

/**
 * Le champ portant ce `name`, typé par son sélecteur de balise.
 *
 * `findAll('input')` rend des enveloppes de champs, donc `element.value` et
 * `element.checked` se lisent sans assertion de type.
 */
function fieldNamed(wrapper: VueWrapper, name: string) {
  const found = wrapper.findAll('input').find((input) => input.attributes('name') === name);

  if (found === undefined) {
    throw new Error(`aucun champ nommé ${name}`);
  }

  return found;
}

/** Les cases cochées, toutes listes confondues. */
function checkedBoxes(wrapper: VueWrapper) {
  return wrapper
    .findAll('input')
    .filter((input) => input.attributes('type') === 'checkbox' && input.element.checked);
}

let router: Router;

async function mountPage(): Promise<VueWrapper> {
  router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push('/profil');
  await router.isReady();

  const wrapper = mount(HouseholdProfilePage, {
    attachTo: document.body,
    global: { plugins: [router] },
  });

  await flushPromises();

  return wrapper;
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('HouseholdProfilePage', () => {
  it('charge le profil du foyer de la session, sans le nommer', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    // Aucun identifiant de foyer dans l'adresse appelée : le serveur sert
    // celui de la session (ADR 0015).
    expect(calls[0]?.path).toBe('/api/household/profile');
    expect(wrapper.find('h1').text()).toBe('Profil du foyer');
    expect(fieldNamed(wrapper, 'name').element.value).toBe('Chez moi');
  });

  it('emploie les composants du design system pour les trois groupes', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    /*
      La sélection multiple d'une liste déroulante est une limite connue du
      design system : les allergènes et les régimes sont donc des cases dans un
      `fieldset`, soit du HTML natif (ADR 0016).
    */
    const legends = wrapper.findAll('legend').map((legend) => legend.text());

    expect(legends).toContain('Régimes');
    expect(legends).toContain('Allergies et intolérances');
    // 14 allergènes et 3 régimes en cases ; 5 objectifs (dont « sans
    // préférence », qui reprend la réponse) et 3 équilibres en boutons radio.
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(17);
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(8);
    // Et la case de l'allergène déclaré est cochée, elle seule.
    expect(checkedBoxes(wrapper)).toHaveLength(1);
  });

  it('dit que les réponses de santé sont facultatives', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    // La phrase est portée par la legend du groupe, donc reliée aux cases.
    expect(wrapper.text()).toContain('Facultatif');
    expect(wrapper.text()).toContain("ne sortent pas de l'application");
  });

  it('prévient que les quantités seront estimées au-delà de six personnes', async () => {
    stubResponses([profileResponse({ peopleCount: 8 })]);

    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('les quantités des recettes seront estimées');
  });

  it("n'affiche pas cet avertissement en deçà", async () => {
    stubResponses([profileResponse({ peopleCount: 6 })]);

    const wrapper = await mountPage();

    expect(wrapper.text()).not.toContain('seront estimées');
  });

  it('envoie tous les champs et confirme', async () => {
    stubResponses([profileResponse(), profileResponse({ peopleCount: 5 })]);

    const wrapper = await mountPage();

    await fieldNamed(wrapper, 'peopleCount').setValue('5');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls[1]?.path).toBe('/api/household/profile');
    expect(calls[1]?.init?.method).toBe('PATCH');

    const sent = bodyOf(1);

    expect(sent.peopleCount).toBe(5);
    // Le budget part en centimes, le champ étant en euros.
    expect(sent.monthlyBudgetCents).toBe(18_000);
    expect(sent.excludedIngredients).toEqual(['coriandre']);
    expect(wrapper.text()).toContain('Profil enregistré.');
  });

  it('refuse un champ illisible sans appeler le serveur', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    await fieldNamed(wrapper, 'peopleCount').setValue('quatre');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls).toHaveLength(1);
    expect(wrapper.text()).toContain('Indiquez un nombre entier.');
  });

  it('refuse une borne avec sa phrase, sans appeler le serveur', async () => {
    stubResponses([profileResponse()]);

    const wrapper = await mountPage();

    await fieldNamed(wrapper, 'peopleCount').setValue('40');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls).toHaveLength(1);
    expect(wrapper.text()).toContain('Indiquez un nombre de personnes, de 1 à 35.');
  });

  it("remet un refus de l'API sous son champ", async () => {
    stubResponses([profileResponse(), fieldRefusal('name', 'Trop long')]);

    const wrapper = await mountPage();

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Indiquez un nom de foyer, de 1 à 60 caractères.');
    expect(wrapper.text()).not.toContain('Profil enregistré.');
  });

  it('montre une phrase française quand le service ne répond pas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Le service est injoignable.');
    expect(wrapper.find('form').exists()).toBe(false);
  });
});
