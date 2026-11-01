import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import type { Page } from '@playwright/test';

/*
  Les tests de bout en bout servent une construction statique, sans API derrière
  (voir playwright.config.ts). Or chaque page interroge la sonde de santé pour
  savoir s'il faut montrer le bandeau de service : sans réponse, ce bandeau
  apparaîtrait partout, et les mesures de géométrie et les passages axe-core
  porteraient sur une page que personne ne verra.

  D'où ces deux bouchons. La requête est bien émise par le navigateur, donc
  `page.on('request')` la voit et le contrôle des requêtes tierces la juge comme
  les autres ; c'est le bouchon qui y répond, sans que rien n'atteigne le réseau
  ni le mandataire de prévisualisation.
*/

/** Le chemin de la sonde, tel que le client du front l'appelle. */
const HEALTH_ROUTE = '**/api/health';

/** Fait répondre la sonde : le bandeau de service reste muet. */
export async function stubHealthyApi(page: Page): Promise<void> {
  await page.route(HEALTH_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    }),
  );
}

/** Fait échouer la sonde comme une API arrêtée le ferait, au format RFC 9457. */
export async function stubUnavailableApi(page: Page): Promise<void> {
  await page.route(HEALTH_ROUTE, (route) =>
    route.fulfill({
      status: 503,
      contentType: PROBLEM_DETAILS_MEDIA_TYPE,
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Service indisponible',
        status: 503,
        detail: 'Le service est momentanément indisponible.',
        requestId: '00000000-0000-4000-8000-000000000000',
      }),
    }),
  );
}
