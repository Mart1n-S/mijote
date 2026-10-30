import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { Result } from 'axe-core';

/*
  Le contrôle axe-core est partagé par tous les tests de bout en bout : les
  étiquettes doivent être les mêmes partout, sinon un écran se trouve relu
  selon un référentiel différent des autres sans que personne ne le voie.
*/

// RGAA 4.1 niveau AA s'appuie sur WCAG 2.1 niveau AA : ce sont les étiquettes
// axe-core correspondantes.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Les violations d'accessibilité de la page dans son état courant. */
export async function accessibilityViolations(page: Page): Promise<Result[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  return result.violations;
}
