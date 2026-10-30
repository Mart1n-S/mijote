// @vitest-environment jsdom

import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { MAIN_CONTENT_ID, documentTitleFor, installNavigationFeedback } from './navigation';

/** Un routeur minimal : ce test porte sur le retour de navigation, pas sur les pages. */
function routerForTest() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'home',
        component: { template: '<p>accueil</p>' },
        meta: { title: 'Accueil' },
      },
      {
        path: '/elsewhere',
        name: 'elsewhere',
        component: { template: '<p>ailleurs</p>' },
        meta: { title: 'Ailleurs' },
      },
    ],
  });

  installNavigationFeedback(router);

  return router;
}

describe('documentTitleFor', () => {
  it('fait précéder le nom du site par celui de la page', () => {
    expect(documentTitleFor('Accueil')).toBe('Accueil - Mijote');
  });

  it("se replie sur le nom du site quand la page n'a pas de titre", () => {
    expect(documentTitleFor(undefined)).toBe('Mijote');
  });
});

describe('installNavigationFeedback', () => {
  beforeEach(() => {
    document.title = 'avant';
    document.body.innerHTML = `<main id="${MAIN_CONTENT_ID}" tabindex="-1">contenu</main>`;
  });

  it('met le titre du document à jour à chaque page', async () => {
    const router = routerForTest();

    await router.push({ name: 'home' });
    expect(document.title).toBe('Accueil - Mijote');

    await router.push({ name: 'elsewhere' });
    expect(document.title).toBe('Ailleurs - Mijote');
  });

  it('place le focus sur le contenu principal après un changement de page', async () => {
    const router = routerForTest();

    await router.push({ name: 'home' });
    await router.push({ name: 'elsewhere' });
    // Le focus est posé après le rendu de la nouvelle page.
    await nextTick();

    expect(document.activeElement?.id).toBe(MAIN_CONTENT_ID);
  });

  it('ne déplace pas le focus au premier affichage', async () => {
    const router = routerForTest();

    await router.push({ name: 'home' });
    await nextTick();

    // Le focus doit rester au début du document, avant le lien d'évitement.
    expect(document.activeElement).toBe(document.body);
  });
});
