import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import { stubAnonymousApi, stubPasswordReset, STUB_RESET_TOKEN } from './api';

/*
  Le mot de passe oublié dans un vrai navigateur : le lien depuis la connexion,
  la demande, et le choix du nouveau mot de passe.

  C'est le seul endroit où le fragment de l'adresse est vraiment un fragment, et
  où son effacement de la barre d'adresse se vérifie.

  Un passage axe-core par écran, comme le veut le socle d'accessibilité
  (ADR 0007).
*/

const EMAIL = 'titulaire@exemple.test';
const PASSWORD = 'un mot de passe tout neuf';

const SENT = 'Si un compte existe pour cette adresse, un e-mail vient de partir.';

const RESET_PATH = '/mot-de-passe/reinitialisation';

test.describe('la demande de réinitialisation', () => {
  test('est atteignable depuis la connexion', async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/connexion');

    await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();

    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mot de passe oublié' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Mot de passe oublié - Mijote');
  });

  test('répond la même chose à toute adresse, et le dit ainsi', async ({ page }) => {
    const stub = await stubPasswordReset(page);

    await page.goto('/mot-de-passe-oublie');

    await page.getByLabel('Adresse e-mail').fill(EMAIL);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();

    /*
      Le message parle de ce qui a été fait, pas de ce qui existe : c'est la
      contrepartie à l'écran de l'absence d'oracle, que le serveur garantit par
      ailleurs (ADR 0014).
    */
    await expect(page.getByText(SENT)).toBeVisible();
    expect(stub.demands).toEqual([{ email: EMAIL }]);
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubPasswordReset(page);
    await page.goto('/mot-de-passe-oublie');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Mot de passe oublié' }),
    ).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test.describe('le choix du nouveau mot de passe', () => {
  test("efface le jeton de l'adresse, et ne l'envoie que dans le corps", async ({ page }) => {
    const stub = await stubPasswordReset(page);

    await page.goto(`${RESET_PATH}#${STUB_RESET_TOKEN}`);

    await expect(page.getByLabel('Nouveau mot de passe')).toBeVisible();

    /*
      Le jeton ne reste pas dans la barre d'adresse : ce que l'historique du
      navigateur garde de cette visite ne vaut plus rien.
    */
    expect(page.url()).not.toContain(STUB_RESET_TOKEN);
    expect(page.url()).toContain(RESET_PATH);

    await page.getByLabel('Nouveau mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText('Votre mot de passe est à jour')).toBeVisible();
    // Il est bien parti dans le corps du POST, et non dans l'adresse appelée.
    expect(stub.resets).toEqual([{ token: STUB_RESET_TOKEN, password: PASSWORD }]);
  });

  test('renvoie vers la connexion, sans ouvrir de session', async ({ page }) => {
    await stubPasswordReset(page);
    await page.goto(`${RESET_PATH}#${STUB_RESET_TOKEN}`);

    await page.getByLabel('Nouveau mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await page.getByRole('link', { name: 'Se connecter' }).click();

    /*
      La connexion, et non l'accueil : on vient de fermer toutes les sessions du
      compte, et en rouvrir une pour le porteur du lien affaiblirait ce geste
      (ADR 0014). Sans session, la garde renverrait de toute façon ici.
    */
    await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  });

  test("montre le refus unique d'un lien qui ne vaut plus rien", async ({ page }) => {
    await stubPasswordReset(page);
    await page.goto(`${RESET_PATH}#un-jeton-qui-ne-vaut-rien`);

    await page.getByLabel('Nouveau mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText("Ce lien n'est plus valable.")).toBeVisible();
    // La seule issue est un nouveau lien, et l'écran y mène.
    await expect(page.getByRole('link', { name: 'Demander un nouveau lien' })).toBeVisible();
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubPasswordReset(page);
    await page.goto(`${RESET_PATH}#${STUB_RESET_TOKEN}`);

    // L'attente n'est pas une précaution : axe-core ne se plaint pas d'une page
    // vide, et le formulaire n'apparaît qu'après la lecture du fragment.
    await expect(page.getByLabel('Nouveau mot de passe')).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
