// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mustActivateTwoFactor, resetSessionForTests } from '../session/session';

import TwoFactorPage from './TwoFactorPage.vue';

/*
  L'activation : ce que la page demande, ce qu'elle envoie, et ce qu'elle montre
  une seule fois. Le parcours dans un vrai navigateur, avec axe-core, vit dans
  e2e/two-factor.spec.ts.
*/

const PASSWORD = 'un mot de passe assez long';
const KEY = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const URI = `otpauth://totp/Mijote%3Amartin%40exemple.test?secret=${KEY}&issuer=Mijote`;

const CODES = [
  '1-ABCD-EFGH-JKLM',
  '2-BCDE-FGHJ-KLMN',
  '3-CDEF-GHJK-LMNP',
  '4-DEFG-HJKL-MNPQ',
  '5-EFGH-JKLM-NPQR',
  '6-FGHJ-KLMN-PQRS',
  '7-GHJK-LMNP-QRST',
  '8-HJKL-MNPQ-RSTU',
  '9-JKLM-NPQR-STUV',
  '10-KLMN-PQRS-TUVW',
];

function stubResponses(responses: Response[]): void {
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

function enrollment(): Response {
  return new Response(JSON.stringify({ uri: URI, key: KEY }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function activated(): Response {
  return new Response(JSON.stringify({ codes: CODES }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** La session telle que le serveur la rend après l'activation. */
function sessionWithTwoFactor(): Response {
  return new Response(
    JSON.stringify({
      account: {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'martin@exemple.test',
        householdId: '22222222-2222-4222-8222-222222222222',
        role: 'admin',
      },
      twoFactor: { active: true },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function wrongPassword(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Authentification requise',
      status: 401,
      detail: 'Mot de passe incorrect.',
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 401, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

/** La première étape : le mot de passe, puis l'inscription. */
async function enroll(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('input[type="password"]').setValue(PASSWORD);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  resetSessionForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TwoFactorPage', () => {
  it('commence par redemander le mot de passe', () => {
    stubResponses([]);

    const wrapper = mount(TwoFactorPage);

    expect(wrapper.find('h1').text()).toBe('Double authentification');
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    // Rien d'autre n'est demandé avant : le secret n'est pas encore engendré.
    expect(wrapper.find('input[name="code"]').exists()).toBe(false);
  });

  it('refuse un mot de passe vide sans appeler le serveur', async () => {
    stubResponses([]);

    const wrapper = mount(TwoFactorPage);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toContain('Indiquez votre mot de passe.');
  });

  it('montre le QR code et la clé en texte, et demande un premier code', async () => {
    stubResponses([enrollment()]);

    const wrapper = mount(TwoFactorPage);

    await enroll(wrapper);

    const image = wrapper.find('img');

    expect(image.exists()).toBe(true);
    // Une image de données, dessinée ici : rien ne part vers un service
    // distant, puisque l'URI contient le secret.
    /*
      Une URI de données : l'image est dans la page, donc aucune requête ne
      part, et surtout pas vers un service de QR code, qui recevrait le secret.
      L'espace de noms `xmlns` que porte le SVG n'est pas une requête.
    */
    expect(image.attributes('src')).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(image.attributes('src') ?? '')).toContain('<path');
    /*
      Décorative : la clé est donnée juste en dessous, en texte, lisible par un
      lecteur d'écran.
    */
    expect(image.attributes('alt')).toBe('');

    // La clé en groupes de quatre, pour se recopier sans se perdre.
    expect(wrapper.text()).toContain('JBSW Y3DP EHPK 3PXP');
    expect(wrapper.find('input[name="code"]').exists()).toBe(true);
    /*
      Ici, et seulement ici, le clavier numérique : l'activation n'accepte que
      six chiffres, là où l'écran de connexion accepte aussi un code de secours
      fait de lettres.
    */
    expect(wrapper.find('input[name="code"]').attributes('inputmode')).toBe('numeric');
  });

  it('montre le message du serveur sur un mot de passe refusé', async () => {
    stubResponses([wrongPassword()]);

    const wrapper = mount(TwoFactorPage);

    await enroll(wrapper);

    expect(wrapper.find('[role="alert"]').text()).toContain('Mot de passe incorrect.');
    // Aucun secret n'a été engendré : on reste sur la première étape.
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('envoie le mot de passe et le code pour activer', async () => {
    stubResponses([enrollment(), activated(), sessionWithTwoFactor()]);

    const wrapper = mount(TwoFactorPage);

    await enroll(wrapper);
    await wrapper.find('input[name="code"]').setValue('123456');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const body: unknown = vi.mocked(fetch).mock.calls[1]?.[1]?.body;

    /*
      Les deux ensemble : l'activation exige le mot de passe, sinon une session
      volée inscrirait l'application de l'attaquant et verrouillerait le
      propriétaire.
    */
    expect(typeof body === 'string' ? JSON.parse(body) : undefined).toEqual({
      password: PASSWORD,
      code: '123456',
    });
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe('/api/auth/two-factor/activate');
  });

  it("n'invite plus à activer ce qui vient de l'être", async () => {
    /*
      Le point bloquant de la relecture : la relecture de session doit être
      forcée. `ensureSessionLoaded` sort aussitôt dès que la garde de
      navigation a déjà lu, donc l'en-tête continuait d'inviter à activer, et
      le lien ramenait sur un écran qui répond « déjà active ».
    */
    stubResponses([enrollment(), activated(), sessionWithTwoFactor()]);

    const wrapper = mount(TwoFactorPage);

    await enroll(wrapper);
    await wrapper.find('input[name="code"]').setValue('123456');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(vi.mocked(fetch).mock.calls[2]?.[0]).toBe('/api/auth/session');
    expect(mustActivateTwoFactor.value).toBe(false);
  });

  it('montre les dix codes de secours, une seule fois', async () => {
    stubResponses([enrollment(), activated(), sessionWithTwoFactor()]);

    const wrapper = mount(TwoFactorPage);

    await enroll(wrapper);
    await wrapper.find('input[name="code"]').setValue('123456');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const shown = wrapper.findAll('li').map((item) => item.text());

    expect(shown).toEqual(CODES);
    expect(wrapper.text()).toContain('ne seront plus affichés');
    // Le secret et le mot de passe ne sont plus à l'écran, ni en mémoire de la
    // page : l'étape précédente est passée.
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('JBSW Y3DP');
  });
});
