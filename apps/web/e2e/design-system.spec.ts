import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/*
  La page de démonstration du design system sert de support au contrôle
  d'accessibilité automatisé. Elle n'existe pas en production : les tests
  servent une construction build:demo, qui ne diffère que par cette page
  (voir playwright.config.ts).

  Ce fichier porte aussi ce que jsdom ne peut pas vérifier : l'activation d'un
  bouton natif au clavier, et le démontage du dialogue avec le retour du focus,
  que Reka UI fait à la fin de l'animation de sortie.
*/

// RGAA 4.1 niveau AA s'appuie sur WCAG 2.1 niveau AA : ce sont les étiquettes
// axe-core correspondantes.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  return result.violations;
}

test.describe('page de démonstration du design system', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design-system');
    await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
  });

  test.describe('en mode clair', () => {
    test.use({ colorScheme: 'light' });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      expect(await violations(page)).toEqual([]);
    });
  });

  test.describe('en mode sombre', () => {
    test.use({ colorScheme: 'dark' });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      expect(await violations(page)).toEqual([]);
    });
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
    const toggle = page.getByRole('button', { name: 'Mettre Enregistrer en cours' });
    const save = page.getByRole('button', { name: /^Enregistrer/ });

    await expect(save).not.toHaveAttribute('aria-disabled', 'true');

    await toggle.focus();
    await page.keyboard.press('Enter');

    // En cours, le bouton garde le focus et reste atteignable : il porte
    // aria-disabled, jamais l'attribut disabled.
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(save).not.toHaveAttribute('disabled', '');

    await page.getByRole('button', { name: "Arrêter l'action en cours" }).focus();
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

      expect(await violations(page)).toEqual([]);
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
      expect(overlap ?? 0).toBeLessThanOrEqual(1);
    });

    test("n'a aucune violation d'accessibilité", async ({ page }) => {
      expect(await violations(page)).toEqual([]);
    });
  });
});
