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
  test('affiche son titre principal', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Mijote' })).toBeVisible();
  });
});
