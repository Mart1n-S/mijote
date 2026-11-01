import { expect, test } from '@playwright/test';

import { accessibilityMatrix } from './accessibility';
import { stubHealthyApi } from './api';

/*
  L'adresse est volontairement quelconque : ce qui est contrôlé ici est ce que
  voit un visiteur arrivé par un lien périmé ou une adresse mal recopiée, et
  non une page que l'application proposerait.
*/
const UNKNOWN_PATH = '/une-adresse-qui-nexiste-pas';

accessibilityMatrix(UNKNOWN_PATH);

test.describe('page de repli', () => {
  test.beforeEach(async ({ page }) => {
    await stubHealthyApi(page);
    await page.goto(UNKNOWN_PATH);
  });

  test('dit que la page est introuvable, titre du document compris', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();

    // Sans meta.title, le titre du document se repliait sur « Mijote », qui ne
    // dit pas qu'il s'agit d'une page introuvable.
    await expect(page).toHaveTitle('Page introuvable - Mijote');
  });

  test("ramène à l'accueil", async ({ page }) => {
    await page.getByRole('link', { name: "Retour à l'accueil" }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  });
});
