import { expect, test } from '@playwright/test';

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

  test.describe('à 320 px de large, équivalent du zoom à 200 %', () => {
    test.use({ viewport: { width: 320, height: 640 } });

    test('ne provoque aucun défilement horizontal', async ({ page }) => {
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;

        return root.scrollWidth - root.clientWidth;
      });

      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('ne laisse pas la barre de navigation masquer le contenu', async ({ page }) => {
      const overlap = await page.evaluate(() => {
        // Jusqu'en bas de page : c'est là que la barre fixe recouvrirait le
        // contenu si sa hauteur n'était pas réservée. Le défilement est
        // instantané, parce que la feuille de base le rend animé par défaut
        // et que la mesure tomberait alors avant l'arrivée en bas.
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });

        const nav = document.querySelector('nav');
        const footer = document.querySelector('footer');

        if (nav === null || footer === null) {
          return null;
        }

        // getBoundingClientRect est relatif à la fenêtre : c'est exactement la
        // question posée, le dernier élément de la page passe-t-il sous la
        // barre.
        return footer.getBoundingClientRect().bottom - nav.getBoundingClientRect().top;
      });

      expect(overlap).not.toBeNull();
      /*
        Mesuré au pixel entier, et pas en-dessous. La réserve de place est
        exacte, hauteur de la barre et liseré compris : ce qui reste est la
        position fractionnaire du pied de page, que le moteur arrondit selon la
        hauteur du contenu au-dessus. Un vrai recouvrement ferait au moins un
        pixel, et ce test le verrait.
      */
      expect(Math.round(overlap ?? 0)).toBeLessThanOrEqual(0);
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

    test('ne perd ni contenu ni lisibilité', async ({ page }) => {
      const mesure = await page.evaluate(() => {
        document.documentElement.style.fontSize = '32px';

        const nav = document.querySelector('nav');
        const footer = document.querySelector('footer');

        if (nav === null || footer === null) {
          return null;
        }

        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });

        return {
          // La page ne défile pas de côté : c'est la barre qui défile si ses
          // libellés ne tiennent plus, et le tableau large qui défile seul.
          debordement: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          // La barre garde la hauteur d'une seule ligne, donc la réserve de
          // place reste exacte et rien ne passe dessous.
          hauteurBarre: Math.round(nav.getBoundingClientRect().height),
          recouvrement: Math.round(
            footer.getBoundingClientRect().bottom - nav.getBoundingClientRect().top,
          ),
          // Les libellés doublent vraiment : sans cela, le test ne mesurerait
          // rien.
          taillePolice: getComputedStyle(nav.querySelector('a') ?? nav).fontSize,
        };
      });

      expect(mesure).not.toBeNull();
      expect(mesure?.taillePolice).toBe('28px');
      expect(mesure?.debordement).toBeLessThanOrEqual(0);
      expect(mesure?.recouvrement).toBeLessThanOrEqual(0);
      // 44 px de zone tactile doublés, plus le liseré.
      expect(mesure?.hauteurBarre).toBe(89);
    });
  });
});
