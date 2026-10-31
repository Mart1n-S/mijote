import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Result } from 'axe-core';

/*
  Le contrôle axe-core est partagé par tous les tests de bout en bout : les
  étiquettes doivent être les mêmes partout, sinon un écran se trouve relu
  selon un référentiel différent des autres sans que personne ne le voie.
*/

// RGAA 4.1 niveau AA s'appuie sur WCAG 2.1 niveau AA : ce sont les étiquettes
// axe-core correspondantes.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Les violations d'accessibilité de la page dans son état courant. */
export async function accessibilityViolations(page: Page): Promise<Result[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  return result.violations;
}

/*
  Les quatre contextes sous lesquels tout écran est contrôlé. Ils étaient
  recopiés dans le fichier de la page de démonstration, et l'accueil, seul
  écran réellement livré, n'en recevait qu'un : le thème clair, à la taille de
  fenêtre par défaut.

  320 px de large est la largeur de référence du critère Reflow (WCAG 2.1,
  1.4.10), qui la définit comme une fenêtre de 1280 px zoomée à 400 %.
  Doubler la taille de base du document est autre chose : c'est ce que fait
  l'agrandissement de texte seul d'un navigateur sur des tailles en rem, que le
  projet utilise partout (RGAA 10.4). Les deux cassent des choses différentes,
  d'où les deux contextes.
*/
const NARROW_VIEWPORT = { width: 320, height: 640 };

/**
 * Ouvre l'écran et attend qu'il soit rendu.
 *
 * L'attente n'est pas une précaution de style : axe-core ne se plaint jamais
 * d'une page vide. Sans elle, un écran dont la vue arrive en différé (import
 * dynamique, données à charger) serait analysé avant d'exister, et le contrôle
 * passerait au vert sans rien avoir mesuré. Les quatre contrôles que cette
 * matrice a remplacés tenaient cette garantie par le `beforeEach` de leur
 * fichier, qui attendait le titre de niveau 1.
 */
async function gotoRenderedScreen(page: Page, path: string): Promise<void> {
  await page.goto(path);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/**
 * Enregistre les quatre contrôles axe-core d'un écran. À appeler au premier
 * niveau d'un fichier de test, hors de tout `describe` : chaque contexte pose
 * son propre `test.use`, qui ne vaut que pour le bloc où il est déclaré.
 */
export function accessibilityMatrix(path: string): void {
  test.describe(`${path}, en mode clair`, () => {
    test.use({ colorScheme: 'light' });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      await gotoRenderedScreen(page, path);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });

  test.describe(`${path}, en mode sombre`, () => {
    test.use({ colorScheme: 'dark' });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      await gotoRenderedScreen(page, path);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });

  test.describe(`${path}, à 320 px de large`, () => {
    test.use({ viewport: NARROW_VIEWPORT });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      await gotoRenderedScreen(page, path);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });

  test.describe(`${path}, au texte agrandi à 200 %`, () => {
    test.use({ viewport: NARROW_VIEWPORT });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      await gotoRenderedScreen(page, path);

      const bodyFontSize = await page.evaluate(() => {
        document.documentElement.style.fontSize = '32px';

        return getComputedStyle(document.body).fontSize;
      });

      // Le texte doit vraiment avoir doublé : sans ce contrôle, un changement
      // de la taille de base ferait analyser la page non agrandie, et le
      // contexte passerait en n'ayant rien agrandi.
      expect(bodyFontSize).toBe('32px');

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });
}
