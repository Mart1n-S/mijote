import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import {
  stubHealthyApi,
  stubLockedAdmin,
  stubUnlockedAdmin,
  STUB_CODE,
  STUB_INVITATION,
  STUB_INVITED_EMAIL,
} from './api';

/*
  L'espace d'administration, dans un vrai navigateur : l'entrée, les
  invitations, et le déverrouillage par code d'une session rouverte.

  Un seul passage axe-core par écran, comme le veut le socle d'accessibilité
  (ADR 0007).
*/

const INVITED = 'quelquun@exemple.test';

test.describe("l'espace d'administration", () => {
  test("ne s'ouvre qu'à un administrateur", async ({ page }) => {
    // Le compte de bouchon est un compte ordinaire.
    await stubHealthyApi(page);
    await page.goto('/administration');

    /*
      Une page introuvable, et non un refus : pour ce compte, cette page
      n'existe pas. Ce qui protège l'administration reste le serveur, qui
      refuse ces routes de son côté.
    */
    await expect(page.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    // Et la barre de navigation ne la propose pas.
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Administration' }),
    ).toHaveCount(0);
  });

  test('mène aux invitations depuis la navigation', async ({ page }) => {
    await stubUnlockedAdmin(page);
    await page.goto('/');

    await page.getByRole('navigation').getByRole('link', { name: 'Administration' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();

    await page.getByRole('link', { name: 'Invitations' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
    await expect(page.getByRole('cell', { name: STUB_INVITED_EMAIL })).toBeVisible();
  });

  test('envoie une invitation, puis la révoque', async ({ page }) => {
    const stub = await stubUnlockedAdmin(page);

    await page.goto('/administration/invitations');
    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();

    await page.getByLabel('Adresse e-mail').fill(INVITED);
    await page.getByRole('button', { name: "Envoyer l'invitation" }).click();

    await expect(page.getByRole('status')).toContainText('Invitation envoyée');
    expect(stub.creations).toEqual([{ email: INVITED, role: 'user' }]);

    // Le lien n'est jamais montré : le jeton n'existe que dans l'e-mail.
    await expect(page.getByText('/invitation#')).toHaveCount(0);

    await page.getByRole('button', { name: 'Révoquer' }).click();

    await expect(page.getByRole('cell', { name: 'Révoquée' })).toBeVisible();
    expect(stub.revoked).toEqual([STUB_INVITATION.id]);
  });

  test("n'a aucune violation d'accessibilité, sur les deux écrans", async ({ page }) => {
    await stubUnlockedAdmin(page);

    await page.goto('/administration');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await accessibilityViolations(page), "entrée de l'administration").toEqual([]);

    await page.goto('/administration/invitations');
    // Le tableau arrive après un appel : sans cette attente, axe-core relirait
    // une page sans lui.
    await expect(page.getByRole('table')).toBeVisible();

    expect(await accessibilityViolations(page), 'liste des invitations').toEqual([]);
  });
});

test.describe('le déverrouillage', () => {
  test('conduit au code, puis à la page demandée', async ({ page }) => {
    const stub = await stubLockedAdmin(page);

    await page.goto('/administration/invitations');

    await expect(
      page.getByRole('heading', { level: 1, name: "Déverrouiller l'administration" }),
    ).toBeVisible();

    await page.getByLabel('Code').fill('000000');
    await page.getByRole('button', { name: 'Déverrouiller' }).click();

    // Dans le formulaire : le bandeau d'état du service a sa propre région
    // aria-live, montée elle aussi.
    await expect(page.locator('form').getByRole('alert')).toContainText(
      'Code incorrect ou expiré.',
    );

    await page.getByLabel('Code').fill(STUB_CODE);
    await page.getByRole('button', { name: 'Déverrouiller' }).click();

    // On repart là où on allait, et non sur une page d'accueil quelconque.
    await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible();
    expect(stub.codes).toEqual([{ code: '000000' }, { code: STUB_CODE }]);
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubLockedAdmin(page);
    await page.goto('/administration');

    await expect(
      page.getByRole('heading', { level: 1, name: "Déverrouiller l'administration" }),
    ).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
