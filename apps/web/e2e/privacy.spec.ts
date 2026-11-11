import { LAST_ADMIN_REFUSAL } from '@mijote/shared';
import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import { stubAnonymousApi, stubPrivacy, STUB_EXPORT_FILENAME, STUB_PASSWORD } from './api';

/*
  L'export, la suppression et la page de confidentialité, dans un vrai
  navigateur.

  Deux choses ne se mesurent que là : le **téléchargement** d'un blob, que jsdom
  ne sait pas faire, et le **dialogue réellement ouvert**, avec son piège de
  focus et son ARIA.

  Un passage axe-core par écran nouveau, comme le veut le socle (ADR 0007) : la
  page de confidentialité, et le profil avec le dialogue ouvert, qui est une
  interface que la story #14 n'avait pas.
*/

test.describe('mes données', () => {
  test("télécharge l'export sous le nom que le serveur propose", async ({ page }) => {
    await stubPrivacy(page);
    await page.goto('/profil');

    await expect(page.getByRole('heading', { level: 2, name: 'Mes données' })).toBeVisible();

    const download = page.waitForEvent('download');

    await page.getByRole('button', { name: 'Télécharger mes données' }).click();

    // Le nom vient de l'en-tête du serveur, et non d'un calcul du front.
    expect((await download).suggestedFilename()).toBe(STUB_EXPORT_FILENAME);
    await expect(page.getByText('Fichier téléchargé.')).toBeVisible();
  });

  test('ouvre le dialogue de suppression, sans violation axe-core', async ({ page }) => {
    await stubPrivacy(page);
    await page.goto('/profil');

    await page.getByRole('button', { name: 'Supprimer mon compte' }).click();

    const dialog = page.getByRole('dialog');

    await expect(dialog).toBeVisible();
    // Le focus est entré dans le dialogue : c'est Reka UI qui le fait, et c'est
    // la raison de l'avoir pris (ADR 0001).
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await expect(dialog.getByLabel('Votre mot de passe')).toBeVisible();
    // Le second facteur est inactif sur ce compte : pas de champ de code.
    await expect(dialog.getByLabel('Code de double authentification')).toHaveCount(0);

    expect(await accessibilityViolations(page)).toEqual([]);
  });

  test('revient sur le profil quand on annule, focus compris', async ({ page }) => {
    await stubPrivacy(page);
    await page.goto('/profil');

    const trigger = page.getByRole('button', { name: 'Supprimer mon compte' });

    await trigger.click();

    // Rempli avant d'annuler : c'est ce qui donne du sens à la réouverture, en
    // bas de ce test.
    const dialog = page.getByRole('dialog');

    await dialog.getByRole('checkbox').check();
    await dialog.getByLabel('Votre mot de passe').fill(STUB_PASSWORD);

    await page.getByRole('button', { name: 'Annuler' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Le focus revient sur le bouton qui a ouvert : un retour qui ne se voit
    // pas à la relecture, et que jsdom ne sait pas montrer.
    await expect(trigger).toBeFocused();

    /*
      Et la réouverture repart d'un dialogue vide. La case est la friction
      voulue par l'ADR 0017 : restée cochée, elle ne frictionne plus rien. C'est
      ici que ça se mesure, jsdom ne démontant pas le contenu du dialogue.
    */
    await trigger.click();

    const reopened = page.getByRole('dialog');

    await expect(reopened.getByRole('checkbox')).not.toBeChecked();
    await expect(reopened.getByLabel('Votre mot de passe')).toHaveValue('');
  });

  test('ferme la suppression au seul administrateur', async ({ page }) => {
    await stubPrivacy(page, { blocked: true });
    await page.goto('/profil');

    await expect(page.getByRole('button', { name: 'Supprimer mon compte' })).toBeDisabled();
    // La phrase du serveur, et pas une seconde version écrite à l'écran.
    await expect(page.getByText(LAST_ADMIN_REFUSAL)).toBeVisible();
  });

  test('supprime le compte, puis laisse un autre compte ouvrir le même onglet', async ({
    page,
  }) => {
    const stub = await stubPrivacy(page);

    await page.goto('/profil');
    await page.getByRole('button', { name: 'Supprimer mon compte' }).click();

    const dialog = page.getByRole('dialog');

    await dialog.getByRole('checkbox').check();
    await dialog.getByLabel('Votre mot de passe').fill(STUB_PASSWORD);
    /*
      Entrée dans le champ, et non un clic : le bouton d'envoi est hors du
      formulaire, rattaché par son attribut `form`, et c'est ce qui le fait
      entrer dans la soumission implicite. Un remaniement du dialogue qui
      perdrait ce rattachement casserait la touche Entrée sans bruit.
    */
    await dialog.getByLabel('Votre mot de passe').press('Enter');

    // La confirmation est partie au serveur, case comprise : c'est lui qui
    // l'exige (ADR 0017).
    await expect(page).toHaveURL(/\/connexion\?compte=supprime$/);
    expect(stub.deletions).toEqual([{ password: STUB_PASSWORD, confirmed: true }]);
    await expect(page.getByText('Votre compte a été supprimé')).toBeVisible();

    /*
      Le cœur de ce test : un autre compte se connecte dans le **même onglet**,
      sans rechargement. L'application doit le conduire au premier lancement,
      que son foyer n'a pas fait. Avec un état local qui aurait survécu à la
      suppression, elle le laisserait sur l'accueil avec la valeur du foyer
      détruit : c'est le défaut de la story #14, et il se reproduirait ici
      (ADR 0017).
    */
    await page.getByLabel('Adresse e-mail').fill('suivant@exemple.test');
    await page.getByLabel('Mot de passe').fill(STUB_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/premier-lancement$/);
  });
});

test.describe('la page de confidentialité', () => {
  test('se lit sans session, depuis le pied de page', async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/connexion');

    await page.getByRole('link', { name: 'Confidentialité' }).click();

    await expect(page).toHaveURL(/\/confidentialite$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Confidentialité' })).toBeVisible();
    await expect(page).toHaveTitle('Confidentialité - Mijote');
  });

  test('dit les durées, et passe axe-core', async ({ page }) => {
    await stubAnonymousApi(page);
    await page.goto('/confidentialite');

    await expect(page.getByText(/sauvegardes : sept jours au plus/)).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Combien de temps' })).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
