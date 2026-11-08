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
const TWO_FACTOR_ROUTE = '**/api/auth/two-factor';
const TWO_FACTOR_SETUP_ROUTE = '**/api/auth/two-factor/setup';
const TWO_FACTOR_ACTIVATE_ROUTE = '**/api/auth/two-factor/activate';
const TWO_FACTOR_UNLOCK_ROUTE = '**/api/auth/two-factor/unlock';
const INVITATION_PREVIEW_ROUTE = '**/api/invitations/preview';
const INVITATION_ACCEPT_ROUTE = '**/api/invitations/accept';
const INVITATION_REVOKE_ROUTE = '**/api/invitations/*/revoke';
/*
  La liste et la création. Le motif exclut les deux routes publiques et la
  révocation : Playwright prend la première route qui correspond, et un motif
  trop large répondrait à leur place.
*/
const INVITATIONS_ROUTE = '**/api/invitations';

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

/** Le code que le faux serveur accepte, et la clé qu'il fait inscrire. */
export const STUB_CODE = '123456';
export const STUB_TOTP_KEY = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** Les dix codes de secours, tels que le vrai serveur les rendrait. */
export const STUB_BACKUP_CODES = [
  '1-ABCD-EFGH-JKLM',
  '2-BCDE-FGHJ-KLMN',
  '3-CDEF-GHJK-LMNP',
  '4-DEFG-HJKL-MNPQ',
  '5-EFGH-JKLM-NPQR',
  '6-FGHJ-KLMN-PQRS',
  '7-GHJK-LMNP-QRST',
  '8-HJKL-MNPQ-RSTU',
  '9-JKLM-NPQR-STUV',
  '10-KLMN-PQRS-TUVW',
];

/** Le compte administrateur, qui doit inscrire une application. */
export const STUB_ADMIN = { ...STUB_ACCOUNT, role: 'admin' };

/*
  Le message d'un code refusé, mot pour mot celui de l'API : le même pour un
  code faux, un code de secours consommé et un numéro qui n'existe pas.
*/
const INVALID_CODE_BODY = problem(401, 'Authentification requise', 'Code incorrect ou expiré.');

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
  await respondJson(
    page,
    SESSION_ROUTE,
    200,
    JSON.stringify({ account: STUB_ACCOUNT, twoFactor: { active: false, adminUnlocked: false } }),
  );
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
      body: JSON.stringify({
        account: STUB_ACCOUNT,
        twoFactor: { active: false, adminUnlocked: false },
      }),
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

/** Ce que les bouchons du second facteur ont enregistré. */
export interface StubbedTwoFactor {
  /** Les corps des appels à /auth/two-factor, dans l'ordre. */
  codes: unknown[];
  /** Les corps des appels d'inscription et d'activation. */
  setups: unknown[];
  activations: unknown[];
}

/**
 * Fait répondre l'API comme pour un compte qui a un second facteur.
 *
 * La connexion rend `twoFactorRequired` au lieu d'ouvrir une session, et la
 * soumission du code n'accepte que `STUB_CODE`. Le cookie CSRF est posé dès la
 * première réponse, comme le vrai le fait pour l'attente.
 */
export async function stubTwoFactorLogin(page: Page): Promise<StubbedTwoFactor> {
  const recorded: StubbedTwoFactor = { codes: [], setups: [], activations: [] };

  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));
  await respondProblem(page, SESSION_ROUTE, 401, ANONYMOUS);

  await page.route(LOGIN_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': `${CSRF_COOKIE}=${STUB_CSRF_TOKEN}; Path=/; SameSite=Lax` },
      body: JSON.stringify({ twoFactorRequired: true }),
    });
  });

  await page.route(TWO_FACTOR_ROUTE, async (route) => {
    const body: unknown = route.request().postDataJSON();

    recorded.codes.push(body);

    const accepted =
      typeof body === 'object' && body !== null && 'code' in body && body['code'] === STUB_CODE;

    await route.fulfill(
      accepted
        ? {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              account: STUB_ACCOUNT,
              twoFactor: { active: true, adminUnlocked: true },
            }),
          }
        : { status: 401, contentType: PROBLEM_DETAILS_MEDIA_TYPE, body: INVALID_CODE_BODY },
    );
  });

  return recorded;
}

/**
 * Fait répondre l'API comme pour un administrateur sans second facteur.
 *
 * C'est l'état qui conduit à l'écran d'activation : la session existe, mais
 * aucune route d'administration ne l'accepterait.
 */
export async function stubAdminWithoutTwoFactor(page: Page): Promise<StubbedTwoFactor> {
  const recorded: StubbedTwoFactor = { codes: [], setups: [], activations: [] };

  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));
  await respondJson(
    page,
    SESSION_ROUTE,
    200,
    JSON.stringify({ account: STUB_ADMIN, twoFactor: { active: false, adminUnlocked: false } }),
  );

  await page.route(TWO_FACTOR_SETUP_ROUTE, async (route) => {
    recorded.setups.push(route.request().postDataJSON());

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        uri: `otpauth://totp/Mijote%3A${encodeURIComponent(STUB_ACCOUNT.email)}?secret=${STUB_TOTP_KEY}&issuer=Mijote`,
        key: STUB_TOTP_KEY,
      }),
    });
  });

  await page.route(TWO_FACTOR_ACTIVATE_ROUTE, async (route) => {
    recorded.activations.push(route.request().postDataJSON());

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ codes: STUB_BACKUP_CODES }),
    });
  });

  return recorded;
}

/** Le jeton que les bouchons d'invitation acceptent, et l'adresse invitée. */
export const STUB_INVITATION_TOKEN = 'un-jeton-opaque-de-test';
export const STUB_INVITED_EMAIL = 'invitee@exemple.test';

/** Une invitation en attente, telle que l'API la rendrait. */
export const STUB_INVITATION = {
  id: '33333333-3333-4333-8333-000000000001',
  email: STUB_INVITED_EMAIL,
  role: 'user',
  status: 'pending',
  createdAt: '2026-11-01T10:00:00.000Z',
  expiresAt: '2026-11-04T10:00:00.000Z',
};

/** Ce que les bouchons d'invitation ont enregistré. */
export interface StubbedInvitations {
  /** Les corps des appels d'aperçu et d'acceptation, dans l'ordre. */
  previews: unknown[];
  accepts: unknown[];
  /** Les corps des créations, et les identifiants révoqués. */
  creations: unknown[];
  revoked: string[];
}

/**
 * Fait répondre l'API comme pour une invitation en attente, sans session.
 *
 * C'est l'état de quelqu'un qui ouvre son lien : la page lit le jeton dans le
 * fragment, l'échange contre un POST, puis crée le compte.
 */
export async function stubPendingInvitation(page: Page): Promise<StubbedInvitations> {
  const recorded: StubbedInvitations = { previews: [], accepts: [], creations: [], revoked: [] };

  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));
  await respondProblem(page, SESSION_ROUTE, 401, ANONYMOUS);

  await page.route(INVITATION_PREVIEW_ROUTE, async (route) => {
    recorded.previews.push(route.request().postDataJSON());

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: STUB_INVITED_EMAIL }),
    });
  });

  await page.route(INVITATION_ACCEPT_ROUTE, async (route) => {
    recorded.accepts.push(route.request().postDataJSON());

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: { 'set-cookie': `${CSRF_COOKIE}=${STUB_CSRF_TOKEN}; Path=/; SameSite=Lax` },
      body: JSON.stringify({
        account: { ...STUB_ACCOUNT, email: STUB_INVITED_EMAIL },
        twoFactor: { active: false, adminUnlocked: false },
      }),
    });
  });

  return recorded;
}

/**
 * Fait répondre l'API comme pour un administrateur déverrouillé.
 *
 * C'est l'état qui ouvre l'espace d'administration : rôle administrateur,
 * second facteur actif, et code validé dans cette session (ADR 0012).
 */
export async function stubUnlockedAdmin(page: Page): Promise<StubbedInvitations> {
  const recorded: StubbedInvitations = { previews: [], accepts: [], creations: [], revoked: [] };
  /*
    La liste évolue au fil du test : le bouchon la garde ici, comme le serveur
    garderait ses lignes, pour que la relecture qui suit un envoi montre bien ce
    qui vient d'être écrit.
  */
  let invitations: unknown[] = [STUB_INVITATION];

  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));
  await respondJson(
    page,
    SESSION_ROUTE,
    200,
    JSON.stringify({
      account: STUB_ADMIN,
      twoFactor: { active: true, adminUnlocked: true },
    }),
  );

  await page.route(INVITATION_REVOKE_ROUTE, async (route) => {
    const found = /invitations\/([^/]+)\/revoke/.exec(route.request().url());

    recorded.revoked.push(found?.[1] ?? '');
    invitations = invitations.map((row) =>
      typeof row === 'object' && row !== null ? { ...row, status: 'revoked' } : row,
    );

    await route.fulfill({ status: 204 });
  });

  await page.route(INVITATIONS_ROUTE, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ invitations }),
      });

      return;
    }

    recorded.creations.push(route.request().postDataJSON());

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(STUB_INVITATION),
    });
  });

  return recorded;
}

/**
 * Fait répondre l'API comme pour une session rouverte par la mémorisation :
 * administrateur, second facteur actif, mais administration verrouillée.
 */
export async function stubLockedAdmin(page: Page): Promise<{ codes: unknown[] }> {
  const recorded: { codes: unknown[] } = { codes: [] };
  let unlocked = false;

  await respondJson(page, HEALTH_ROUTE, 200, JSON.stringify({ status: 'ok' }));

  await page.route(SESSION_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'set-cookie': `${CSRF_COOKIE}=${STUB_CSRF_TOKEN}; Path=/; SameSite=Lax` },
      body: JSON.stringify({
        account: STUB_ADMIN,
        twoFactor: { active: true, adminUnlocked: unlocked },
      }),
    });
  });

  await page.route(TWO_FACTOR_UNLOCK_ROUTE, async (route) => {
    const body: unknown = route.request().postDataJSON();

    recorded.codes.push(body);

    const accepted =
      typeof body === 'object' && body !== null && 'code' in body && body['code'] === STUB_CODE;

    if (!accepted) {
      await route.fulfill({
        status: 401,
        contentType: PROBLEM_DETAILS_MEDIA_TYPE,
        body: INVALID_CODE_BODY,
      });

      return;
    }

    unlocked = true;

    await route.fulfill({ status: 204 });
  });

  await page.route(INVITATIONS_ROUTE, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ invitations: [STUB_INVITATION] }),
    });
  });

  return recorded;
}
