// @vitest-environment jsdom

import { LAST_ADMIN_REFUSAL, PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { markOnboardingDone } from '../../household/onboarding';
import { createRoutes } from '../../routes';
import { ensureOnboardingLoaded, needsOnboarding } from '../../household/onboarding';
import { ensureSessionLoaded, isAuthenticated, resetSessionForTests } from '../../session/session';

import AccountDataSection from './AccountDataSection.vue';

/*
  L'export et la suppression, à l'écran.

  Le parcours dans un vrai navigateur, avec axe-core et le dialogue réellement
  ouvert, vit dans e2e/privacy.spec.ts. Ici se mesure ce qu'un navigateur ne
  montre pas facilement : ce qui est envoyé, ce qui ne l'est pas, et ce qu'il
  reste de l'état local après une suppression.
*/

const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'titulaire@exemple.test',
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'user' as const,
};

/** Le contenu du fichier d'export n'importe pas ici : il n'est pas affiché. */
const EXPORT_BODY = '{"format":1}';

const EXPORT_FILENAME = 'mijote-mes-donnees-2026-11-11.json';

function sessionResponse(twoFactorActive: boolean): Response {
  return new Response(
    JSON.stringify({
      account: ACCOUNT,
      twoFactor: { active: twoFactorActive, adminUnlocked: false },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function deletionState(blocked: boolean): Response {
  return new Response(JSON.stringify({ blocked }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function exportResponse(): Response {
  return new Response(EXPORT_BODY, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${EXPORT_FILENAME}"`,
    },
  });
}

/** Un refus de l'API, au format RFC 9457. */
function refusal(status: number, detail: string): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Refus',
      status,
      detail,
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

let calls: { path: string; init: RequestInit | undefined }[];

/**
 * Répond par chemin, et non par une file.
 *
 * L'ordre des appels dépend des crochets de montage, et un test qui en
 * dépendrait casserait au premier déplacement de l'appel. Chaque chemin a donc
 * sa réponse, et `calls` garde ce qui est parti.
 */
function stubApi(responses: {
  session?: Response;
  deletion?: Response;
  export?: Response;
  delete?: Response;
}): void {
  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      calls.push({ path, init });

      if (path.endsWith('/auth/session') && responses.session !== undefined) {
        return Promise.resolve(responses.session);
      }

      if (path.endsWith('/account/deletion')) {
        return Promise.resolve(responses.deletion ?? deletionState(false));
      }

      if (path.endsWith('/account/export')) {
        return Promise.resolve(responses.export ?? exportResponse());
      }

      if (path.endsWith('/account/delete')) {
        return Promise.resolve(responses.delete ?? new Response(null, { status: 204 }));
      }

      throw new Error(`appel non prévu : ${path}`);
    }),
  );
}

/** Ce que le navigateur a été invité à enregistrer. */
let saved: { filename: string | null; revoked: boolean };

/*
  Le téléchargement passe par une URL d'objet et un lien activé : jsdom
  n'implémente ni l'une ni l'autre. Les deux sont donc remplacées, et c'est
  justement ce que ce test veut lire, le nom proposé venant du serveur.

  Deux méthodes espionnées, et **pas** la classe `URL` remplacée : mesuré, un
  `stubGlobal('URL', ...)` casse le constructeur, dont le chemin d'une requête
  se sert, et toute requête échouait alors en « service injoignable ».
*/
function stubDownload(): void {
  saved = { filename: null, revoked: false };

  for (const name of ['createObjectURL', 'revokeObjectURL']) {
    if (!(name in URL)) {
      // jsdom ne les définit pas toujours : il n'y a alors rien à espionner.
      Object.defineProperty(URL, name, { value: () => '', configurable: true, writable: true });
    }
  }

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
    saved.revoked = true;
  });

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLElement) {
    saved.filename = this.getAttribute('download');
  });
}

let router: Router;

async function mountSection(): Promise<VueWrapper> {
  router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push('/profil');
  await router.isReady();

  const wrapper = mount(AccountDataSection, {
    attachTo: document.body,
    global: { plugins: [router] },
  });

  await flushPromises();

  return wrapper;
}

/** Le bouton portant ce libellé, où qu'il soit, dialogue téléporté compris. */
function buttonLabelled(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find((button) =>
    (button.textContent ?? '').includes(label),
  );

  if (found === undefined) {
    throw new Error(`aucun bouton « ${label} »`);
  }

  return found;
}

/** Remplit le champ portant ce label, dans le dialogue. */
function fillLabelled(label: string, value: string): void {
  const field = [...document.body.querySelectorAll('label')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  const input = document.getElementById(field?.getAttribute('for') ?? '');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`aucun champ « ${label} »`);
  }

  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/** Ouvre le dialogue de suppression, comme le ferait un utilisateur. */
async function openDialog(wrapper: VueWrapper): Promise<void> {
  buttonLabelled('Supprimer mon compte').click();
  await wrapper.vm.$nextTick();
}

/** Coche la case de confirmation du dialogue. */
function checkConfirmation(): void {
  document.body.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
}

/** Le corps envoyé à la suppression, qui doit être parti. */
function deleteBody(): unknown {
  const body = calls.find((call) => call.path.endsWith('/account/delete'))?.init?.body;

  if (typeof body !== 'string') {
    throw new Error("la suppression n'a pas été appelée avec un corps JSON");
  }

  return JSON.parse(body);
}

/** Envoie le formulaire du dialogue. */
async function submitDialog(wrapper: VueWrapper): Promise<void> {
  const form = document.body.querySelector('form');

  form?.dispatchEvent(new Event('submit', { cancelable: true }));
  await flushPromises();
  await wrapper.vm.$nextTick();
}

beforeEach(() => {
  resetSessionForTests();
  stubDownload();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe("l'export", () => {
  it('enregistre le fichier sous le nom que le serveur propose', async () => {
    stubApi({});

    const wrapper = await mountSection();

    buttonLabelled('Télécharger mes données').click();
    await flushPromises();

    // Le nom vient de `Content-Disposition` et non d'un calcul du front : deux
    // endroits qui le calculent finiraient par ne plus dire la même chose.
    expect(saved.filename).toBe(EXPORT_FILENAME);

    /*
      Un `POST` bien qu'il ne fasse que lire : une méthode sûre passerait hors
      des barrières CSRF, et une page tierce pourrait alors faire déposer ce
      fichier chez la victime (ADR 0017). C'est le client HTTP qui pose le jeton
      et le type de média, donc c'est la méthode qui se mesure ici.
    */
    expect(calls.find((call) => call.path.endsWith('/account/export'))?.init?.method).toBe('POST');
    // L'URL de l'objet est révoquée : elle retient le blob en mémoire, et ce
    // blob porte des données de santé.
    expect(saved.revoked).toBe(true);
    expect(wrapper.text()).toContain('Fichier téléchargé.');
  });

  it("montre le message de l'API quand l'export échoue", async () => {
    stubApi({ export: refusal(503, 'Le service est momentanément indisponible.') });

    const wrapper = await mountSection();

    buttonLabelled('Télécharger mes données').click();
    await flushPromises();

    expect(saved.filename).toBeNull();
    expect(wrapper.text()).toContain('momentanément indisponible');
  });
});

describe('la suppression', () => {
  it('désactive le bouton du seul administrateur, et dit par où passer', async () => {
    stubApi({ deletion: deletionState(true) });

    const wrapper = await mountSection();

    expect(buttonLabelled('Supprimer mon compte').disabled).toBe(true);
    // La phrase du serveur, partagée : l'écran n'en écrit pas une seconde
    // version (ADR 0017).
    expect(wrapper.text()).toContain(LAST_ADMIN_REFUSAL);
  });

  it("n'appelle rien sans la case cochée", async () => {
    stubApi({});

    const wrapper = await mountSection();

    await openDialog(wrapper);
    await submitDialog(wrapper);

    expect(document.body.textContent).toContain('Cochez la case');
    expect(calls.map((call) => call.path)).not.toContain('/api/account/delete');
  });

  it("n'appelle rien sans le mot de passe", async () => {
    stubApi({});

    const wrapper = await mountSection();

    await openDialog(wrapper);
    checkConfirmation();
    await submitDialog(wrapper);

    expect(document.body.textContent).toContain('Indiquez votre mot de passe');
    expect(calls.map((call) => call.path)).not.toContain('/api/account/delete');
  });

  it('envoie le mot de passe et la confirmation, sans code, quand le second facteur est inactif', async () => {
    stubApi({});

    const wrapper = await mountSection();

    await openDialog(wrapper);
    checkConfirmation();
    fillLabelled('Votre mot de passe', 'un mot de passe assez long');
    await submitDialog(wrapper);

    expect(deleteBody()).toEqual({ password: 'un mot de passe assez long', confirmed: true });
    // Pas de champ de code à l'écran non plus : le serveur ne l'exige que
    // quand le second facteur est actif.
    expect(document.body.textContent).not.toContain('Code de double authentification');
  });

  it('exige et envoie le code quand le second facteur est actif', async () => {
    stubApi({ session: sessionResponse(true) });

    await ensureSessionLoaded();

    const wrapper = await mountSection();

    await openDialog(wrapper);
    checkConfirmation();
    fillLabelled('Votre mot de passe', 'un mot de passe assez long');
    await submitDialog(wrapper);

    // Le code manque : rien ne part, et le champ porte son erreur.
    expect(document.body.textContent).toContain('Indiquez le code');
    expect(calls.map((call) => call.path)).not.toContain('/api/account/delete');

    fillLabelled('Code de double authentification', ' 123456 ');
    await submitDialog(wrapper);

    // Le code part sans ses espaces : un code recopié depuis un gestionnaire
    // en traîne souvent.
    expect(deleteBody()).toEqual({
      password: 'un mot de passe assez long',
      confirmed: true,
      code: '123456',
    });
  });

  it('redemande la confirmation après une fermeture', async () => {
    stubApi({});

    const wrapper = await mountSection();

    await openDialog(wrapper);
    checkConfirmation();
    fillLabelled('Votre mot de passe', 'un mot de passe assez long');

    buttonLabelled('Annuler').click();
    await wrapper.vm.$nextTick();
    await openDialog(wrapper);
    await submitDialog(wrapper);

    /*
      La case est la friction voulue par l'ADR 0017 : restée cochée au second
      passage, elle ne frictionne plus rien. Et le mot de passe n'a pas à vivre
      dans la page après la fermeture.

      C'est le **modèle** qui est mesuré ici, par le refus qu'il provoque, et
      non la case à l'écran : en jsdom, Reka UI ne démonte pas le contenu du
      dialogue, faute d'animation de sortie, et la propriété `checked` du
      contrôle reste alors celle qu'un clic y a posée. L'état visible après
      réouverture est mesuré dans un vrai navigateur, par e2e/privacy.spec.ts.
    */
    expect(document.body.textContent).toContain('Cochez la case');
    expect(calls.map((call) => call.path)).not.toContain('/api/account/delete');
  });

  it('garde le dialogue ouvert et montre le refus du serveur', async () => {
    stubApi({ delete: refusal(409, LAST_ADMIN_REFUSAL) });

    const wrapper = await mountSection();

    await openDialog(wrapper);
    checkConfirmation();
    fillLabelled('Votre mot de passe', 'un mot de passe assez long');
    await submitDialog(wrapper);

    // Le message vit dans le dialogue : le fermer le ferait disparaître avec
    // lui.
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      LAST_ADMIN_REFUSAL,
    );
    expect(router.currentRoute.value.path).toBe('/profil');
  });

  it("oublie tout l'état local, puis renvoie à la connexion avec un message", async () => {
    stubApi({ session: sessionResponse(false) });

    /*
      Le compte connecté et un premier lancement déjà fait : c'est l'état que la
      suppression doit emporter. Sans cela, la garde décidait pour le compte
      suivant connecté dans le même onglet avec la valeur du foyer détruit, le
      défaut que la story #14 a connu (ADR 0017).
    */
    await ensureSessionLoaded();
    markOnboardingDone();

    // Le compte est bien chargé avant la suppression : sans cette assertion,
    // celle d'après passerait même si rien n'était oublié.
    expect(isAuthenticated.value).toBe(true);

    const wrapper = await mountSection();

    await openDialog(wrapper);
    checkConfirmation();
    fillLabelled('Votre mot de passe', 'un mot de passe assez long');
    await submitDialog(wrapper);

    expect(isAuthenticated.value).toBe(false);
    expect(router.currentRoute.value.fullPath).toBe('/connexion?compte=supprime');

    /*
      L'état du premier lancement est redemandé au serveur, qui répond pour le
      foyer du compte suivant : ici, un parcours à faire.
    */
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ done: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

    await ensureOnboardingLoaded();

    expect(needsOnboarding.value).toBe(true);
  });
});
