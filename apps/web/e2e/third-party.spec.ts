import { expect, test } from '@playwright/test';

import { stubHealthyApi } from './api';

/*
  Aucune page ne doit appeler un service tiers. La règle vient de deux
  endroits : la police doit être hébergée par le projet (critère de l'issue
  #7), et security.md interdit de faire fuiter quoi que ce soit vers un
  domaine extérieur.

  Ce contrôle était affirmé dans la documentation sans être vérifié nulle
  part. Il l'est ici, sur chaque page de l'application.
*/

/** Toutes les pages servies, y compris celles qui n'existent qu'en démo. */
const PAGES = [
  { path: '/', name: "page d'accueil" },
  { path: '/design-system', name: 'page de démonstration' },
];

for (const page_ of PAGES) {
  test(`${page_.name} : aucune requête vers un service tiers`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
    const outside: string[] = [];

    page.on('request', (request) => {
      if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) {
        outside.push(request.url());
      }
    });

    // La sonde est bouchonnée, mais la requête part quand même du
    // navigateur : l'écouteur ci-dessus la voit, et vérifie donc bien qu'elle
    // reste sur l'origine de l'application. Sans bouchon, elle irait jusqu'au
    // mandataire de prévisualisation, qui n'a aucune API derrière lui.
    await stubHealthyApi(page);
    await page.goto(page_.path);

    // La police ne part au téléchargement qu'au moment où du texte l'utilise :
    // attendre ici, sinon le contrôle passerait avant la seule requête qui
    // risquerait de sortir.
    await page.evaluate(() => document.fonts.ready);

    expect(outside).toEqual([]);
  });
}

test('la police du projet est servie par le projet et bien chargée', async ({ page }) => {
  await stubHealthyApi(page);
  await page.goto('/design-system');
  await page.evaluate(() => document.fonts.ready);

  const font = await page.evaluate(() => ({
    famille: getComputedStyle(document.body).fontFamily,
    chargee: document.fonts.check("16px 'Atkinson Hyperlegible Next'"),
  }));

  expect(font.famille).toContain('Atkinson Hyperlegible Next');
  expect(font.chargee).toBe(true);
});
