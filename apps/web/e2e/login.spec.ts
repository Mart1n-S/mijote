import { CSRF_HEADER } from '@mijote/shared';
import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import { stubAnonymousApi, STUB_ACCOUNT, STUB_PASSWORD } from './api';

/*
  Le parcours de connexion dans un vrai navigateur : la garde de navigation, le
  formulaire, le refus, la réussite et la déconnexion.

  Un seul passage axe-core, comme le veut le socle d'accessibilité (ADR 0007) :
  la matrice à cinq contextes reste sur les écrans qui l'avaient déjà.
*/

/** Remplit le formulaire, comme une personne le ferait. */
async function fillForm(
  page: import('@playwright/test').Page,
  password: string,
  remember = false,
): Promise<void> {
  await page.getByLabel('Adresse e-mail').fill(STUB_ACCOUNT.email);
  await page.getByLabel('Mot de passe').fill(password);

  if (remember) {
    await page.getByLabel('Se souvenir de moi').check();
  }

  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test.describe('la connexion', () => {
  test("renvoie à la connexion quand personne n'est connecté", async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/');

    // Le chemin demandé est gardé tel quel dans l'adresse de la connexion.
    await expect(page).toHaveURL(/\/connexion\?suivant=\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
    await expect(page).toHaveTitle('Connexion - Mijote');
    /*
      Sans session, il n'y a nulle part où aller : la barre de navigation
      disparaît plutôt que de proposer des pages que la garde refuserait.
    */
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/connexion');

    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });

  test('refuse un mot de passe faux, sans dire si le compte existe', async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/connexion');
    await fillForm(page, 'pas le bon mot de passe');

    /*
      Celle du formulaire, et pas celle du gabarit : le bandeau d'état du
      service est une seconde région d'alerte, vide ici.
    */
    const alert = page.locator('form').getByRole('alert');

    await expect(alert).toContainText('Adresse e-mail ou mot de passe incorrect.');
    // Rien qui distingue une adresse inconnue d'un mot de passe faux.
    await expect(alert).not.toContainText(/compte|adresse inconnue|existe/i);
    await expect(page).toHaveURL(/\/connexion/);
  });

  test('ouvre la session et ramène où on allait', async ({ page }) => {
    const stub = await stubAnonymousApi(page);

    await page.goto('/');
    await expect(page).toHaveURL(/\/connexion/);

    await fillForm(page, STUB_PASSWORD);

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    // La barre de navigation revient avec la session.
    await expect(page.getByRole('navigation')).toBeVisible();
    // L'en-tête dit quel compte est ouvert, à la personne qui vient de le dire.
    await expect(page.getByText(STUB_ACCOUNT.email)).toBeVisible();

    expect(stub.logins).toEqual([
      { email: STUB_ACCOUNT.email, password: STUB_PASSWORD, remember: false },
    ]);
  });

  test("n'emmène pas ailleurs après la connexion", async ({ page, baseURL }) => {
    /*
      L'adresse de connexion est celle qu'on envoie par courriel : son paramètre
      de retour ne doit pas pouvoir servir de redirection ouverte. La forme est
      contrôlée par safeNextPath, et c'est ici que le parcours entier le montre,
      dans un vrai navigateur.
    */
    await stubAnonymousApi(page);
    await page.goto('/connexion?suivant=//ailleurs.example/piege');
    await fillForm(page, STUB_PASSWORD);

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    // Sur l'origine de l'application, et à sa racine.
    expect(page.url()).toBe(`${baseURL ?? ''}/`);
  });

  test('envoie la mémorisation quand la case est cochée', async ({ page }) => {
    const stub = await stubAnonymousApi(page);

    await page.goto('/connexion');
    await fillForm(page, STUB_PASSWORD, true);

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    expect(stub.logins).toEqual([
      { email: STUB_ACCOUNT.email, password: STUB_PASSWORD, remember: true },
    ]);
  });

  test('se connecte au clavier seul', async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/connexion');

    // Depuis le haut du document : lien d'évitement, puis le nom du site, puis
    // les champs du formulaire dans leur ordre visuel.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Mijote' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Adresse e-mail')).toBeFocused();

    await page.keyboard.type(STUB_ACCOUNT.email);
    await page.keyboard.press('Tab');
    await page.keyboard.type(STUB_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Se souvenir de moi')).toBeFocused();
    // Entrée depuis un champ du formulaire l'envoie, sans passer par le bouton.
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  });

  test('refuse un formulaire vide sans appeler le serveur', async ({ page }) => {
    const stub = await stubAnonymousApi(page);

    await page.goto('/connexion');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByText('Indiquez une adresse e-mail valide.')).toBeVisible();
    await expect(page.getByText('Indiquez votre mot de passe.')).toBeVisible();
    expect(stub.logins).toEqual([]);
  });

  test('déconnecte, en renvoyant le jeton CSRF du cookie', async ({ page }) => {
    const stub = await stubAnonymousApi(page);

    await page.goto('/connexion');
    await fillForm(page, STUB_PASSWORD);
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();

    await page.getByRole('button', { name: 'Se déconnecter' }).click();

    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();

    /*
      Le parcours complet du jeton CSRF : le serveur l'a posé en cookie lisible
      à la connexion, le client l'a relu et l'a renvoyé en en-tête. C'est la
      troisième barrière de l'ADR 0010, et c'est le seul test qui la traverse en
      entier dans un navigateur.
    */
    expect(stub.logouts).toHaveLength(1);
    expect(stub.logouts[0]?.headers()[CSRF_HEADER.toLowerCase()]).toBe('jeton-csrf-de-test');
    expect(stub.logouts[0]?.headers()['content-type']).toBe('application/json');
  });
});
