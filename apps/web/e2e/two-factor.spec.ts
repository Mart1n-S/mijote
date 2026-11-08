import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import {
  stubAdminWithoutTwoFactor,
  stubTwoFactorLogin,
  STUB_ACCOUNT,
  STUB_BACKUP_CODES,
  STUB_CODE,
  STUB_PASSWORD,
  STUB_TOTP_KEY,
} from './api';

/*
  Les deux écrans de la double authentification, dans un vrai navigateur : la
  saisie du code après le mot de passe, et l'activation.

  Un seul passage axe-core par écran, comme le veut le socle d'accessibilité
  (ADR 0007) : la matrice à cinq contextes reste sur les écrans qui l'avaient
  déjà.
*/

/** Le mot de passe, jusqu'à l'écran du code. */
async function reachCodeStep(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(STUB_ACCOUNT.email);
  await page.getByLabel('Mot de passe').fill(STUB_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('heading', { level: 2, name: 'Code de vérification' })).toBeVisible();
}

test.describe('la saisie du code', () => {
  test('remplace le mot de passe, et reçoit le focus', async ({ page }) => {
    await stubTwoFactorLogin(page);
    await reachCodeStep(page);

    // Le champ du mot de passe a disparu : on est passé à l'étape suivante.
    await expect(page.getByLabel('Mot de passe')).toHaveCount(0);
    // Le focus suit l'écran, sans quoi il faudrait retrouver le champ.
    await expect(page.getByLabel('Code')).toBeFocused();
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubTwoFactorLogin(page);
    await reachCodeStep(page);

    expect(await accessibilityViolations(page)).toEqual([]);
  });

  test('refuse un code faux avec le message du serveur, puis accepte le bon', async ({ page }) => {
    const stub = await stubTwoFactorLogin(page);

    await reachCodeStep(page);
    await page.getByLabel('Code').fill('000000');
    await page.getByRole('button', { name: 'Vérifier' }).click();

    const alert = page.locator('form').getByRole('alert');

    await expect(alert).toContainText('Code incorrect ou expiré.');
    // Rien qui dise si c'était un code du téléphone ou un code de secours.
    await expect(alert).not.toContainText(/secours|téléphone|numéro/i);

    await page.getByLabel('Code').fill(STUB_CODE);
    await page.getByRole('button', { name: 'Vérifier' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    expect(stub.codes).toEqual([{ code: '000000' }, { code: STUB_CODE }]);
  });

  test('se fait au clavier seul', async ({ page }) => {
    await stubTwoFactorLogin(page);
    await reachCodeStep(page);

    // Le focus est déjà dans le champ : il reste à taper et à valider.
    await page.keyboard.type(STUB_CODE);
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
  });
});

test.describe("l'activation", () => {
  test("est proposée dans l'en-tête à un administrateur qui ne l'a pas", async ({ page }) => {
    await stubAdminWithoutTwoFactor(page);
    await page.goto('/');

    const invitation = page.getByRole('link', { name: 'Activer la double authentification' });

    await expect(invitation).toBeVisible();

    await invitation.click();

    await expect(page).toHaveURL(/\/securite\/double-authentification$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Double authentification' }),
    ).toBeVisible();
  });

  test('demande le mot de passe, montre le QR code puis les codes de secours', async ({ page }) => {
    const stub = await stubAdminWithoutTwoFactor(page);

    await page.goto('/securite/double-authentification');
    await page.getByLabel('Mot de passe').fill(STUB_PASSWORD);
    await page.getByRole('button', { name: 'Continuer' }).click();

    /*
      Le QR code est dessiné dans la page : son image est une URI de données,
      donc rien ne part vers un service distant.

      Visé par la balise et non par son rôle : son alternative est vide, donc
      il ne porte pas le rôle `img` dans l'arbre d'accessibilité. C'est voulu,
      la clé étant donnée juste en dessous en texte, et c'est une confirmation
      de plus qu'il est bien décoratif.
    */
    const qr = page.locator('img').first();

    await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml,/);
    // La clé est aussi donnée en texte, lisible par un lecteur d'écran.
    await expect(page.getByText(STUB_TOTP_KEY.replace(/(.{4})/g, '$1 ').trim())).toBeVisible();

    await page.getByLabel("Code affiché par l'application").fill(STUB_CODE);
    await page.getByRole('button', { name: 'Activer' }).click();

    await expect(
      page.getByRole('heading', { level: 2, name: 'Vos codes de secours' }),
    ).toBeVisible();

    for (const code of STUB_BACKUP_CODES) {
      await expect(page.getByText(code, { exact: true })).toBeVisible();
    }

    /*
      Les deux appels portent le mot de passe : l'activation l'exige autant que
      l'inscription, sinon une session volée inscrirait l'application de
      l'attaquant.
    */
    expect(stub.setups).toEqual([{ password: STUB_PASSWORD }]);
    expect(stub.activations).toEqual([{ password: STUB_PASSWORD, code: STUB_CODE }]);
  });

  test("n'a aucune violation d'accessibilité, aux trois étapes", async ({ page }) => {
    await stubAdminWithoutTwoFactor(page);
    await page.goto('/securite/double-authentification');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await accessibilityViolations(page), 'étape du mot de passe').toEqual([]);

    await page.getByLabel('Mot de passe').fill(STUB_PASSWORD);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByLabel("Code affiché par l'application")).toBeVisible();

    expect(await accessibilityViolations(page), "étape de l'inscription").toEqual([]);

    await page.getByLabel("Code affiché par l'application").fill(STUB_CODE);
    await page.getByRole('button', { name: 'Activer' }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Vos codes de secours' }),
    ).toBeVisible();

    expect(await accessibilityViolations(page), 'étape des codes de secours').toEqual([]);
  });
});
