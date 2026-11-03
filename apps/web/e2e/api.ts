import { CSRF_COOKIE, PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import type { Page, Request } from '@playwright/test';

/*
  Les tests de bout en bout servent une construction statique, sans API derrière
  (voir playwright.config.ts). Or chaque page interroge la sonde de santé pour
  savoir s'il faut montrer le bandeau de service, et la garde de navigation
  demande au serveur qui est connecté : sans réponse, l'application montrerait
  le bandeau partout et renverrait tout le monde à la page de connexion.

  D'où ces bouchons. La requête est bien émise par le navigateur, donc
  `page.on('request')` la voit et le contrôle des requêtes tierces la juge comme
  les autres ; c'est le bouchon qui y répond, sans que rien n'atteigne le réseau
  ni le mandataire de prévisualisation.
*/

/** Les chemins de l'API, tels que le client du front les appelle. */
const HEALTH_ROUTE = '**/api/health';
const SESSION_ROUTE = '**/api/auth/session';
const LOGIN_ROUTE = '**/api/auth/login';
const LOGOUT_ROUTE = '**/api/auth/logout';

/** Le compte que les bouchons annoncent comme connecté. */
export const STUB_ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'martin@exemple.test',
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'user',
};

/** Le mot de passe que le faux serveur accepte. */
export const STUB_PASSWORD = 'un mot de passe assez long';

/** Le jeton CSRF que le faux serveur pose, comme le vrai le ferait. */
const STUB_CSRF_TOKEN = 'jeton-csrf-de-test';

function problem(status: number, title: string, detail: string): string {
  return JSON.stringify({
    type: 'about:blank',
    title,
    status,
    detail,
    requestId: '00000000-0000-4000-8000-000000000000',
  });
}

const UNAVAILABLE = problem(
  503,
  'Service indisponible',
  'Le service est momentanément indisponible.',
);

const ANONYMOUS = problem(
  401,
  'Authentification requise',
  'Cette action demande une authentification.',
);

/*
  Le message d'échec de connexion, mot pour mot celui de l'API : identique pour
  une adresse inconnue et un mot de passe faux, pour ne pas révéler les comptes.
*/
const INVALID_CREDENTIALS = problem(
  401,
  'Authentification requise',
  'Adresse e-mail ou mot de passe incorrect.',
);

async function respondJson(page: Page, route: string, status: number, body: string): Promise<void> {
  await page.route(route, (handler) =>
    handler.fulfill({ status, contentType: 'application/json', body }),
  );
}

async function respondProblem(
  page: Page,
  route: string,
  status: number,
  body: string,
): Promise<void> {
  await page.route(route, (handler) =>
    handler.fulfill({ status, contentType: PROBLEM_DETAILS_MEDIA_TYPE, body }),
  );
}

/**
 * Fait répondre l'API comme pour une session ouverte : le bandeau de service
 * reste muet, et la garde de navigation laisse passer.
 */
export async function stubHealthyApi(page: Page): Promise<void> {
  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));
  await respondJson(page, SESSION_ROUTE, 200, JSON.stringify({ account: STUB_ACCOUNT }));
}

/** Fait échouer l'API comme une API arrêtée le ferait, au format RFC 9457. */
export async function stubUnavailableApi(page: Page): Promise<void> {
  await respondProblem(page, HEALTH_ROUTE, 503, UNAVAILABLE);
  /*
    La session échoue aussi : sans réponse du serveur, l'application ne peut pas
    affirmer qu'une session existe, donc elle reste anonyme et montre la page de
    connexion. C'est là que le bandeau de service est vu.
  */
  await respondProblem(page, SESSION_ROUTE, 503, UNAVAILABLE);
}

/** Ce que les bouchons ont enregistré des requêtes reçues. */
export interface StubbedAuth {
  /** Les corps des appels à /auth/login, dans l'ordre. */
  logins: unknown[];
  /** Les requêtes de déconnexion, pour relire leurs en-têtes. */
  logouts: Request[];
}

/**
 * Fait répondre l'API comme pour une visite sans session, connexion comprise.
 *
 * Le faux serveur pose le cookie CSRF que le vrai poserait : c'est ce qui
 * permet de vérifier que le client le relit et le renvoie en en-tête sur la
 * déconnexion.
 */
export async function stubAnonymousApi(page: Page): Promise<StubbedAuth> {
  const recorded: StubbedAuth = { logins: [], logouts: [] };

  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));
  await respondProblem(page, SESSION_ROUTE, 401, ANONYMOUS);

  await page.route(LOGIN_ROUTE, async (route) => {
    const body: unknown = route.request().postDataJSON();

    recorded.logins.push(body);

    const accepted =
      typeof body === 'object' &&
      body !== null &&
      'password' in body &&
      body['password'] === STUB_PASSWORD;

    if (!accepted) {
      await route.fulfill({
        status: 401,
        contentType: PROBLEM_DETAILS_MEDIA_TYPE,
        body: INVALID_CREDENTIALS,
      });

      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        // Lisible par le script, comme le vrai : c'est ainsi que le client le
        // retrouve. Pas de Secure ici, la prévisualisation étant en clair.
        'set-cookie': `${CSRF_COOKIE}=${STUB_CSRF_TOKEN}; Path=/; SameSite=Lax`,
      },
      body: JSON.stringify({ account: STUB_ACCOUNT }),
    });
  });

  await page.route(LOGOUT_ROUTE, async (route) => {
    recorded.logouts.push(route.request());

    await route.fulfill({
      status: 204,
      headers: { 'set-cookie': `${CSRF_COOKIE}=; Path=/; Max-Age=0` },
    });
  });

  return recorded;
}
