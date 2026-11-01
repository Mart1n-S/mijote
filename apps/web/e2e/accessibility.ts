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
  Les cinq contextes sous lesquels tout écran est contrôlé. Ils étaient
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
 * Double la taille de base du document, et vérifie que l'agrandissement a pris.
 *
 * Sans ce contrôle, un changement de la taille de base ferait mesurer la page
 * non agrandie, et le contexte passerait en n'ayant rien agrandi.
 */
async function enlargeText(page: Page): Promise<void> {
  const bodyFontSize = await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';

    return getComputedStyle(document.body).fontSize;
  });

  expect(bodyFontSize).toBe('32px');
}

/** Le débordement horizontal du document, en pixels. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;

    return root.scrollWidth - root.clientWidth;
  });
}

/** De combien la barre de navigation recouvre la fin de la page, en pixels. */
async function navOverlap(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    // Jusqu'en bas de page : c'est là que la barre fixe recouvrirait le
    // contenu si sa hauteur n'était pas réservée. Le défilement est
    // instantané, parce que la feuille de base le rend animé par défaut et que
    // la mesure tomberait alors avant l'arrivée en bas.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });

    const nav = document.querySelector('nav');
    const footer = document.querySelector('footer');

    if (nav === null || footer === null) {
      return null;
    }

    // getBoundingClientRect est relatif à la fenêtre : c'est exactement la
    // question posée, le dernier élément de la page passe-t-il sous la barre.
    return footer.getBoundingClientRect().bottom - nav.getBoundingClientRect().top;
  });
}

/**
 * Les deux mesures de mise en page des contextes étroits. Le gabarit est
 * partagé par tous les écrans, mais leur contenu ne l'est pas : un tableau, une
 * adresse longue ou une image large débordent sur une page et pas sur l'autre.
 */
function narrowLayoutChecks(path: string, prepare: (page: Page) => Promise<void>): void {
  test('ne provoque aucun défilement horizontal', async ({ page }) => {
    await gotoRenderedScreen(page, path);
    await prepare(page);

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('ne laisse pas la barre de navigation masquer le contenu', async ({ page }) => {
    await gotoRenderedScreen(page, path);
    await prepare(page);

    const overlap = await navOverlap(page);

    expect(overlap).not.toBeNull();
    /*
      Mesuré au pixel entier, et pas en-dessous. La réserve de place est exacte,
      hauteur de la barre et liseré compris : ce qui reste est la position
      fractionnaire du pied de page, que le moteur arrondit selon la hauteur du
      contenu au-dessus. Un vrai recouvrement ferait au moins un pixel, et ce
      test le verrait.
    */
    expect(Math.round(overlap ?? 0)).toBeLessThanOrEqual(0);
  });
}

/** Rien à préparer : le contexte à 320 px ne touche pas à la page. */
async function asIs(): Promise<void> {
  // Volontairement vide : le gabarit étroit vient de la taille de fenêtre.
}

/**
 * Enregistre les contrôles d'accessibilité d'un écran, dans les cinq
 * contextes. À appeler au premier niveau d'un fichier de test, hors de tout
 * `describe` : chaque contexte pose son propre `test.use`, qui ne vaut que pour
 * le bloc où il est déclaré.
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

    narrowLayoutChecks(path, asIs);
  });

  /*
    Les deux axes du thème et du gabarit étaient alignés et non croisés : le
    contexte sombre tournait au gabarit par défaut, 1280 px. Or la barre de
    navigation basse n'existe que sous 640 px, et elle change de fond à ce
    seuil. Elle n'était donc jamais passée à axe-core en thème sombre.

    Ce cinquième contexte ne porte que le contrôle axe-core : les deux mesures
    de mise en page ne dépendent pas du thème, et le contexte clair à 320 px
    les fait déjà. Croiser les deux axes en entier aurait donné huit contextes
    par écran, dont six n'auraient jamais rien dit.
  */
  test.describe(`${path}, à 320 px de large en mode sombre`, () => {
    test.use({ viewport: NARROW_VIEWPORT, colorScheme: 'dark' });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      await gotoRenderedScreen(page, path);

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });

  test.describe(`${path}, au texte agrandi à 200 %`, () => {
    test.use({ viewport: NARROW_VIEWPORT });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      await gotoRenderedScreen(page, path);
      await enlargeText(page);

      expect(await accessibilityViolations(page)).toEqual([]);
    });

    narrowLayoutChecks(path, enlargeText);
  });
}
