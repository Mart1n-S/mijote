import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import { stubHealthyApi, stubUnavailableApi } from './api';

/*
  Le parcours complet du format d'erreur, du problème RFC 9457 renvoyé par
  l'API jusqu'à la phrase française affichée : c'est le seul test qui le
  traverse en entier dans un vrai navigateur.
*/
test.describe('bandeau de service', () => {
  test("ne montre rien quand l'API répond", async ({ page }) => {
    await stubHealthyApi(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    /*
      La région aria-live existe quand même, et c'est voulu : montée en même
      temps que son message, elle ne l'annoncerait pas (voir BaseAlert). Ce qui
      est vérifié ici est qu'elle est vide, donc invisible.
    */
    await expect(page.getByRole('alert')).toBeEmpty();
  });

  test("dit que le service est indisponible quand l'API ne répond pas", async ({ page }) => {
    await stubUnavailableApi(page);
    await page.goto('/');

    const banner = page.getByRole('alert');

    await expect(banner).toContainText('momentanément indisponible');
    // L'état est nommé en clair, il ne tient pas à la seule couleur.
    await expect(banner).toContainText('Erreur :');
    // Le contenu de la page reste là : le bandeau s'ajoute, il ne remplace rien.
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  });

  test("n'a aucune violation d'accessibilité une fois affiché", async ({ page }) => {
    await stubUnavailableApi(page);
    await page.goto('/');

    await expect(page.getByRole('alert')).toContainText('momentanément indisponible');

    expect(await accessibilityViolations(page)).toEqual([]);
  });

  test("ne montre pas l'identifiant de requête à l'utilisateur", async ({ page }) => {
    await stubUnavailableApi(page);
    await page.goto('/');

    const banner = page.getByRole('alert');

    await expect(banner).toContainText('momentanément indisponible');
    // Il sert à retrouver la trace côté serveur, pas à être lu ici.
    await expect(banner).not.toContainText('00000000-0000-4000-8000-000000000000');
  });
});
