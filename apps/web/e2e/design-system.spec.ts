import { expect, test, type Locator } from '@playwright/test';

import { accessibilityMatrix, accessibilityViolations } from './accessibility';

/*
  La page de démonstration du design system sert de support au contrôle
  d'accessibilité automatisé. Elle n'existe pas en production : les tests
  servent une construction build:demo, qui ne diffère que par cette page
  (voir playwright.config.ts).

  Ce fichier porte aussi ce que jsdom ne peut pas vérifier : l'activation d'un
  bouton natif au clavier, et le démontage du dialogue avec le retour du focus,
  que Reka UI fait à la fin de l'animation de sortie.
*/

accessibilityMatrix('/design-system');

test.describe('page de démonstration du design system', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  });

  test("mène au contenu principal par le lien d'évitement", async ({ page }) => {
    // Le lien d'évitement doit être le premier élément focusable du document.
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skipLink).toBeFocused();
    // Masqué au repos, il doit devenir visible dès qu'il a le focus.
    await expect(skipLink).toBeVisible();

    await page.keyboard.press('Enter');

    await expect(page.locator('main')).toBeFocused();
  });

  test('active un bouton par Entrée et par Espace', async ({ page }) => {
    // Le tableau des états montre lui aussi des boutons « Enregistrer » :
    // on vise celui de la section « Action en cours », et lui seul.
    const section = page.getByRole('region', { name: 'Action en cours' });
    const toggle = section.getByRole('button', { name: 'Mettre Enregistrer en cours' });
    const save = section.getByRole('button', { name: /^Enregistrer/ });

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');

    await toggle.focus();
    await page.keyboard.press('Enter');

    // En cours, le bouton garde le focus et reste atteignable : il porte
    // aria-disabled, jamais l'attribut disabled.
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save).not.toHaveAttribute('disabled', '');

    await section.getByRole('button', { name: "Arrêter l'action en cours" }).focus();
    await page.keyboard.press(' ');

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('annonce un message dans une région aria-live déjà présente', async ({ page }) => {
    // La région doit préexister au message, sinon il n'est pas annoncé.
    const region = page.locator('[role="status"]').last();
    await expect(region).toBeAttached();
    await expect(region).toHaveText('');

    await page.getByRole('button', { name: 'Annoncer un message' }).click();

    await expect(region).toContainText('Message annoncé 1 fois');
  });

  test.describe('dialogue modal', () => {
    test('entre le focus, puis le rend au déclencheur à la fermeture', async ({ page }) => {
      const trigger = page.getByRole('button', { name: 'Supprimer la semaine' });

      await trigger.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText('Supprimer la semaine du 3 novembre ?');

      // Le focus doit être entré dans le dialogue.
      await expect(dialog.locator(':focus')).toBeAttached();

      await page.keyboard.press('Escape');

      // C'est ce que jsdom ne montre pas : le contenu est réellement démonté,
      // et le focus revient sur le bouton qui a ouvert le dialogue.
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test("n'a aucune violation d'accessibilité une fois ouvert", async ({ page }) => {
      await page.getByRole('button', { name: 'Supprimer la semaine' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      expect(await accessibilityViolations(page)).toEqual([]);
    });
  });

  /*
    La copie figée des états recopie à la main les règles des composants, et
    rien ne la gardait : trois divergences y ont vécu sans être vues jusqu'au
    31 octobre 2026.

    Ces tests comparent chaque état figé à ce que le composant vivant de la
    ligne « Repos » produit réellement, en thème sombre. Le thème sombre et
    non le clair, parce que l'une des trois divergences portait sur deux
    jetons qui ont la même valeur en clair : en thème clair, ce test l'aurait
    manquée.
  */
  test.describe('copie figée des états', () => {
    test.use({ colorScheme: 'dark' });

    const FIELD_PROPERTIES = ['border-color', 'background-color'];
    const FOCUS_PROPERTIES = [
      'outline-color',
      'outline-style',
      'outline-width',
      'outline-offset',
      // Le rayon aussi : une des divergences était un border-radius posé sur
      // l'anneau figé, que base.css refuse justement de poser.
      'border-radius',
    ];
    const VARIANTS = ['primary', 'secondary', 'danger'] as const;

    /** Les propriétés calculées d'un élément, dans son état courant. */
    async function computedStyle(
      locator: Locator,
      properties: readonly string[],
    ): Promise<Record<string, string>> {
      return locator.evaluate((element, names: readonly string[]) => {
        const style = getComputedStyle(element);
        const found: Record<string, string> = {};

        for (const name of names) {
          found[name] = style.getPropertyValue(name);
        }

        return found;
      }, properties);
    }

    /*
      La valeur est relevée par expect.poll et non une seule fois : le survol
      et l'enfoncement passent par une transition de --duration-fast, donc la
      première lecture après le geste attrape une couleur intermédiaire, qui
      n'est celle d'aucun état. On attend que la valeur se stabilise sur celle
      de la copie figée, et un vrai écart fait expirer l'attente.
    */
    test('fige le survol du champ comme le composant le produit', async ({ page }) => {
      const frozen = await computedStyle(
        page.getByLabel('Survol', { exact: true }),
        FIELD_PROPERTIES,
      );

      const live = page.getByLabel('Repos', { exact: true });
      await live.hover();

      await expect.poll(() => computedStyle(live, FIELD_PROPERTIES)).toEqual(frozen);
    });

    test("fige l'enfoncement du champ comme le composant le produit", async ({ page }) => {
      const frozen = await computedStyle(
        page.getByLabel('Actif', { exact: true }),
        FIELD_PROPERTIES,
      );

      // Un champ enfoncé est forcément survolé au même instant : les deux
      // règles de BaseField s'appliquent ensemble, et la copie figée doit donc
      // porter le contour autant que le fond.
      const live = page.getByLabel('Repos', { exact: true });
      await live.hover();
      await page.mouse.down();

      try {
        await expect.poll(() => computedStyle(live, FIELD_PROPERTIES)).toEqual(frozen);
      } finally {
        await page.mouse.up();
      }
    });

    test('fige le focus du champ comme le composant le produit', async ({ page }) => {
      const frozen = await computedStyle(
        page.getByLabel('Focus visible', { exact: true }),
        FOCUS_PROPERTIES,
      );

      const live = page.getByLabel('Repos', { exact: true });
      await live.focus();

      expect(frozen).toEqual(await computedStyle(live, FOCUS_PROPERTIES));
    });

    test('fige les états du bouton comme le composant les produit', async ({ page }) => {
      const restRow = page.locator('.states tbody tr').first();

      for (const variant of VARIANTS) {
        const live = restRow.locator(`.button--${variant}`);

        const frozenHover = await computedStyle(page.locator(`.row-hover .button--${variant}`), [
          'background-color',
        ]);
        // translate : l'enfoncement se voit aussi sans la couleur, le bouton
        // descend d'un pixel.
        const frozenActive = await computedStyle(page.locator(`.row-active .button--${variant}`), [
          'background-color',
          'translate',
        ]);

        await live.hover();
        await expect
          .poll(() => computedStyle(live, ['background-color']), {
            message: `survol du bouton ${variant}`,
          })
          .toEqual(frozenHover);

        await page.mouse.down();

        try {
          await expect
            .poll(() => computedStyle(live, ['background-color', 'translate']), {
              message: `enfoncement du bouton ${variant}`,
            })
            .toEqual(frozenActive);
        } finally {
          await page.mouse.up();
        }
      }
    });
  });

  test.describe('navigation', () => {
    test('est une barre fixe en bas sous 640 px', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 700 });

      const nav = page.getByRole('navigation', { name: 'Navigation principale' });
      const box = await nav.boundingBox();

      expect(box).not.toBeNull();
      // Collée au bas de la fenêtre, sur toute sa largeur.
      expect(box?.x).toBeCloseTo(0, 0);
      expect(box?.width).toBeCloseTo(375, 0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(700, 0);
    });

    test('est une colonne latérale au-delà de 640 px', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 700 });

      const nav = page.getByRole('navigation', { name: 'Navigation principale' });
      const navBox = await nav.boundingBox();
      const mainBox = await page.locator('main').boundingBox();

      expect(navBox).not.toBeNull();
      expect(mainBox).not.toBeNull();
      // La navigation est à gauche du contenu, et non au-dessus de lui.
      expect((navBox?.x ?? 0) + (navBox?.width ?? 0)).toBeLessThanOrEqual((mainBox?.x ?? 0) + 1);
    });
  });

  /*
    RGAA 10.4 : le texte doit pouvoir doubler sans perte de contenu ni de
    fonction. Doubler la taille de base du document est exactement ce que fait
    l'agrandissement de texte d'un navigateur sur des tailles en rem, ce que
    le projet utilise partout.
  */
  test.describe('au texte agrandi à 200 %', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    /*
      Le débordement horizontal et le recouvrement par la barre sont mesurés
      pour tous les écrans par la matrice partagée (e2e/accessibility.ts). Ce
      qui reste ici est propre à la barre elle-même : sa hauteur, dont dépend
      la réserve de place, et le fait que ses libellés ont vraiment doublé.
    */
    test('garde la barre de navigation sur une seule ligne', async ({ page }) => {
      const mesure = await page.evaluate(() => {
        document.documentElement.style.fontSize = '32px';

        const nav = document.querySelector('nav');

        if (nav === null) {
          return null;
        }

        return {
          // La barre garde la hauteur d'une seule ligne, donc la réserve de
          // place reste exacte et rien ne passe dessous.
          hauteurBarre: Math.round(nav.getBoundingClientRect().height),
          // Les libellés doublent vraiment : sans cela, le test ne mesurerait
          // rien.
          taillePolice: getComputedStyle(nav.querySelector('a') ?? nav).fontSize,
        };
      });

      expect(mesure).not.toBeNull();
      expect(mesure?.taillePolice).toBe('28px');
      // 44 px de zone tactile doublés, plus le liseré.
      expect(mesure?.hauteurBarre).toBe(89);
    });
  });
});
