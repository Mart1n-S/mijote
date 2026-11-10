import { expect, test } from '@playwright/test';

import { accessibilityViolations } from './accessibility';
import { stubHousehold } from './api';

/*
  Le profil du foyer et le premier lancement, dans un vrai navigateur.

  Deux écrans nouveaux, donc **un passage axe-core par écran**, comme le veut le
  socle d'accessibilité (ADR 0007). C'est aussi le seul endroit où la garde de
  navigation se voit vraiment conduire au parcours.
*/

test.describe('le profil du foyer', () => {
  test('est dans la navigation, et montre les champs du design system', async ({ page }) => {
    await stubHousehold(page);
    await page.goto('/');

    await page.getByRole('link', { name: 'Profil' }).click();

    await expect(page).toHaveURL(/\/profil$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Profil du foyer' })).toBeVisible();
    await expect(page).toHaveTitle('Profil du foyer - Mijote');

    // Les allergènes sont un groupe de cases, pas une liste déroulante à
    // sélection multiple (ADR 0016).
    await expect(page.getByRole('group', { name: 'Allergies et intolérances' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Lait' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Manger équilibré' })).toBeChecked();
  });

  test('enregistre une modification et le confirme', async ({ page }) => {
    const stub = await stubHousehold(page);

    await page.goto('/profil');
    await expect(page.getByLabel('Nom du foyer')).toHaveValue('Chez moi');

    await page.getByLabel('Nombre de personnes').fill('8');
    await page.getByRole('checkbox', { name: 'Arachides' }).check();
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText('Profil enregistré.')).toBeVisible();

    const [patch] = stub.patches;

    expect(patch).toMatchObject({
      peopleCount: 8,
      allergens: ['milk', 'peanuts'],
      // Le budget part en centimes, le champ étant en euros.
      monthlyBudgetCents: 18_000,
    });
  });

  test('prévient que les quantités seront estimées au-delà de six personnes', async ({ page }) => {
    await stubHousehold(page);
    await page.goto('/profil');

    await page.getByLabel('Nombre de personnes').fill('10');

    await expect(page.getByText(/les quantités des recettes seront estimées/)).toBeVisible();
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubHousehold(page);
    await page.goto('/profil');

    // L'attente n'est pas une précaution : axe-core ne se plaint pas d'une page
    // vide, et le formulaire arrive après un appel.
    await expect(page.getByLabel('Nom du foyer')).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});

test.describe('le premier lancement', () => {
  test('est proposé tant qu il reste à faire', async ({ page }) => {
    await stubHousehold(page, false);
    await page.goto('/');

    await expect(page).toHaveURL(/\/premier-lancement$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Bienvenue sur Mijote' }),
    ).toBeVisible();
    await expect(page.getByText('Étape 1 sur 3')).toBeVisible();
  });

  test("n'envoie que les champs de l'étape, puis avance", async ({ page }) => {
    const stub = await stubHousehold(page, false);

    await page.goto('/premier-lancement');
    await page.getByLabel('Nombre de personnes').fill('2');
    await page.getByRole('button', { name: 'Enregistrer et continuer' }).click();

    await expect(
      page.getByRole('heading', { level: 2, name: 'Ce que vous ne mangez pas' }),
    ).toBeVisible();

    const [patch] = stub.patches;

    // Ni budget ni allergènes : l'étape n'envoie que ce qu'elle montre.
    expect(Object.keys(patch as Record<string, unknown>).sort()).toEqual(['name', 'peopleCount']);
  });

  test('se termine depuis n importe quelle étape, et ne revient pas', async ({ page }) => {
    const stub = await stubHousehold(page, false);

    await page.goto('/premier-lancement');
    await page.getByRole('button', { name: 'Terminer plus tard' }).click();

    // On entre dans l'application, et la garde n'y renvoie plus.
    await expect(page.getByRole('heading', { level: 1, name: 'Accueil' })).toBeVisible();
    expect(stub.patches).toEqual([{ onboardingDone: true }]);

    await page.getByRole('link', { name: 'Profil' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Profil du foyer' })).toBeVisible();
  });

  test("n'a aucune violation d'accessibilité", async ({ page }) => {
    await stubHousehold(page, false);
    await page.goto('/premier-lancement');

    await expect(page.getByLabel('Nom du foyer')).toBeVisible();

    expect(await accessibilityViolations(page)).toEqual([]);
  });
});
