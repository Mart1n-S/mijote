import { expect, test } from '@playwright/test';

import { stubAnonymousApi, stubHealthyApi } from './api';

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
  { path: '/', name: "page d'accueil", anonymous: false },
  { path: '/connexion', name: 'page de connexion', anonymous: true },
  { path: '/design-system', name: 'page de démonstration', anonymous: false },
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

    // Le bouchon répond à la sonde sans que rien n'atteigne le réseau, mais
    // l'écouteur ci-dessus voit quand même la requête : son origine est donc
    // bien contrôlée comme celle de n'importe quelle autre.
    /*
      La page de connexion n'est atteignable que sans session : connecté, la
      garde renvoie à l'accueil.
    */
    if (page_.anonymous) {
      await stubAnonymousApi(page);
    } else {
      await stubHealthyApi(page);
    }

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
