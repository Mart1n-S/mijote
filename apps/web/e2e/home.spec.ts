import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe("page d'accueil", () => {
  test('affiche son titre principal', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Mijote' })).toBeVisible();
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await page.goto('/');

    // RGAA 4.1 niveau AA s'appuie sur WCAG 2.1 niveau AA : ce sont les
    // étiquettes axe-core correspondantes.
    const resultat = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(resultat.violations).toEqual([]);
  });
});
