import { expect, test } from '@playwright/test';

import { accessibilityMatrix } from './accessibility';

/*
  L'accueil est le seul écran réellement livré, et c'était celui qui recevait
  le moins de contrôles : un seul passage axe-core, en thème clair, à la taille
  de fenêtre par défaut. Il reçoit désormais la même matrice que la page de
  démonstration, qui n'est jamais livrée.
*/
accessibilityMatrix('/');

test.describe("page d'accueil", () => {
  test('désigne la page de la même façon partout', async ({ page }) => {
    await page.goto('/');

    // Le titre de niveau 1, le titre du document et l'entrée de navigation
    // disaient trois choses différentes : « Mijote », « Accueil - Mijote » et
    // « Accueil ». C'est le nom de la page qui tranche, le nom de marque étant
    // porté par l'en-tête.
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    await expect(page).toHaveTitle('Accueil - Mijote');
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link'),
    ).toHaveText(['Accueil', 'Design system']);
  });
});
