import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import { stubPendingInvitation, STUB_INVITATION_TOKEN, STUB_INVITED_EMAIL } from './api';

/*
  L'inscription par invitation, dans un vrai navigateur : c'est le seul endroit
  où le fragment de l'adresse est vraiment un fragment, et où son effacement de
  la barre d'adresse se vérifie.

  Un seul passage axe-core, comme le veut le socle d'accessibilité (ADR 0007).
*/

const PASSWORD = 'un mot de passe assez long';

test.describe("l'inscription par invitation", () => {
  test("montre l'adresse invitée, et efface le jeton de l'adresse", async ({ page }) => {
    const stub = await stubPendingInvitation(page);

    await page.goto(`/invitation#${STUB_INVITATION_TOKEN}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Créer votre compte' })).toBeVisible();
    await expect(page.getByText(STUB_INVITED_EMAIL)).toBeVisible();

    /*
      Le jeton a servi, et il ne reste pas dans la barre d'adresse : ce que
      l'historique du navigateur garde de cette visite ne vaut plus rien.
    */
    expect(page.url()).not.toContain(STUB_INVITATION_TOKEN);
    expect(page.url()).toContain('/invitation');
    // Il est bien parti dans le corps du POST, et non dans l'adresse appelée.
    expect(stub.previews).toEqual([{ token: STUB_INVITATION_TOKEN }]);
  });

  test("ne demande que le mot de passe, puis entre dans l'application", async ({ page }) => {
    const stub = await stubPendingInvitation(page);

    await page.goto(`/invitation#${STUB_INVITATION_TOKEN}`);
    await expect(page.getByLabel('Mot de passe')).toBeVisible();

    // Aucun champ d'adresse : elle vient de l'invitation.
    await expect(page.getByLabel('Adresse e-mail')).toHaveCount(0);

    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    expect(stub.accepts).toEqual([{ token: STUB_INVITATION_TOKEN, password: PASSWORD }]);
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubPendingInvitation(page);
    await page.goto(`/invitation#${STUB_INVITATION_TOKEN}`);

    // L'attente n'est pas une précaution : axe-core ne se plaint pas d'une page
    // vide, et l'aperçu arrive après un appel.
    await expect(page.getByLabel('Mot de passe')).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
