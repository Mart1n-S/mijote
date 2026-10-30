import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';

test.describe("page d'accueil", () => {
  test('affiche son titre principal', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Mijote' })).toBeVisible();
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await page.goto('/');

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
