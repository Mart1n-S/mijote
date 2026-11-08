// @vitest-environment jsdom

import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { createRoutes } from '../routes';

import InvitationsPage from './InvitationsPage.vue';

/*
  Les invitations vues par l'administrateur : ce que la liste montre, ce que
  l'envoi envoie, et ce que la page ne montre jamais, à savoir le jeton.
*/

const PENDING = {
  id: '33333333-3333-4333-8333-000000000001',
  email: 'invitee@exemple.test',
  role: 'user',
  status: 'pending',
  createdAt: '2026-11-01T10:00:00.000Z',
  expiresAt: '2026-11-04T10:00:00.000Z',
};

const USED = {
  id: '33333333-3333-4333-8333-000000000002',
  email: 'ancien@exemple.test',
  role: 'admin',
  status: 'used',
  createdAt: '2026-10-01T10:00:00.000Z',
  expiresAt: '2026-10-04T10:00:00.000Z',
};

function listing(invitations: unknown[]): Response {
  return new Response(JSON.stringify({ invitations }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createdResponse(): Response {
  return new Response(JSON.stringify(PENDING), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function emailTaken(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Conflit',
      status: 409,
      detail: 'Un compte existe déjà pour cette adresse.',
      requestId: '00000000-0000-4000-8000-000000000000',
    }),
    { status: 409, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
  );
}

let calls: { path: string; method: string; body: string | undefined }[];

function stubResponses(responses: Response[]): void {
  const queue = [...responses];

  calls = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      calls.push({
        path,
        method: (init?.method ?? 'GET').toUpperCase(),
        body: typeof init?.body === 'string' ? init.body : undefined,
      });

      const next = queue.shift();

      if (next === undefined) {
        throw new Error('un appel de plus que prévu');
      }

      return Promise.resolve(next);
    }),
  );
}

async function mountPage(): Promise<VueWrapper> {
  const router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  await router.push('/administration/invitations');
  await router.isReady();

  const wrapper = mount(InvitationsPage, {
    attachTo: document.body,
    global: { plugins: [router] },
  });

  await flushPromises();

  return wrapper;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('InvitationsPage', () => {
  it("montre l'état en mots, dans un vrai tableau", async () => {
    stubResponses([listing([PENDING, USED])]);

    const wrapper = await mountPage();

    // Des en-têtes de colonne, et non une suite de div : chaque cellule est
    // ainsi reliée à sa colonne.
    expect(wrapper.findAll('th[scope="col"]').map((cell) => cell.text())).toEqual([
      'Adresse',
      'Rôle',
      'État',
      'Expire le',
      'Actions',
    ]);

    const rows = wrapper.findAll('tbody tr');

    expect(rows).toHaveLength(2);
    // L'état est écrit : une couleur seule ne le dirait pas.
    expect(rows[0]?.text()).toContain('En attente');
    expect(rows[1]?.text()).toContain('Utilisée');
    expect(rows[1]?.text()).toContain('Administrateur');
  });

  it('ne montre jamais de lien ni de jeton', async () => {
    stubResponses([listing([PENDING, USED])]);

    const wrapper = await mountPage();

    /*
      Le jeton n'existe que dans l'e-mail de l'invité, et l'API ne le rend
      jamais. L'afficher ici le rangerait dans l'historique du navigateur et
      dans les captures d'écran (ADR 0013).
    */
    expect(wrapper.html()).not.toContain('/invitation#');
    expect(wrapper.find('a[href*="invitation"]').exists()).toBe(false);
  });

  it('ne propose de révoquer que ce qui est en attente', async () => {
    stubResponses([listing([PENDING, USED])]);

    const wrapper = await mountPage();
    const buttons = wrapper.findAll('tbody button');

    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.text()).toContain('Révoquer');
  });

  it("envoie l'invitation, puis relit la liste", async () => {
    stubResponses([listing([]), createdResponse(), listing([PENDING])]);

    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Aucune invitation pour le moment.');

    await wrapper.find('input[type="email"]').setValue(PENDING.email);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls[1]).toMatchObject({ path: '/api/invitations', method: 'POST' });
    expect(JSON.parse(calls[1]?.body ?? '')).toEqual({ email: PENDING.email, role: 'user' });
    // La liste est relue : l'écran ne devine pas ce que le serveur a écrit.
    expect(calls[2]).toMatchObject({ path: '/api/invitations', method: 'GET' });
    // L'adresse est répétée à l'administrateur, qui vient de la saisir.
    expect(wrapper.text()).toContain(`Invitation envoyée à ${PENDING.email}`);
  });

  it("n'appelle pas le serveur pour une adresse qui n'en est pas", async () => {
    stubResponses([listing([])]);

    const wrapper = await mountPage();

    await wrapper.find('input[type="email"]').setValue('pas une adresse');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(calls).toHaveLength(1);
    expect(wrapper.text()).toContain('Indiquez une adresse e-mail valide.');
  });

  it("dit à l'administrateur qu'un compte existe déjà", async () => {
    stubResponses([listing([]), emailTaken()]);

    const wrapper = await mountPage();

    await wrapper.find('input[type="email"]').setValue(PENDING.email);
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    /*
      Le message est clair ici, et ce n'est pas un oracle : la route demande le
      rôle administrateur et son second facteur, et c'est précisément la
      personne qui doit savoir pourquoi son invitation ne part pas.
    */
    expect(wrapper.text()).toContain('Un compte existe déjà pour cette adresse.');
  });

  it('révoque une invitation, puis relit la liste', async () => {
    stubResponses([listing([PENDING]), noContent(), listing([{ ...PENDING, status: 'revoked' }])]);

    const wrapper = await mountPage();

    await wrapper.find('tbody button').trigger('click');
    await flushPromises();

    expect(calls[1]).toMatchObject({
      path: `/api/invitations/${PENDING.id}/revoke`,
      method: 'POST',
    });
    expect(wrapper.text()).toContain('Révoquée');
    expect(wrapper.find('tbody button').exists()).toBe(false);
  });
});
