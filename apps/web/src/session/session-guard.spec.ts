import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';

import { resetOnboardingForTests } from '../household/onboarding';

import { installSessionGuard, safeNextPath } from './session-guard';
import { resetSessionForTests } from './session';

/*
  La garde de navigation. Ce qu'elle protège, c'est l'affichage : les données
  sont protégées par l'API, et une garde côté navigateur ne garde rien d'autre
  que ce qui est montré.
*/

const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'martin@exemple.test',
  householdId: '22222222-2222-4222-8222-222222222222',
  role: 'user',
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/*
  La garde interroge deux routes : qui est connecté, et si le premier lancement
  reste à faire. Les bouchons répondent donc par chemin, et le second ne rend
  **qu'un booléen**, comme la vraie route (ADR 0015).
*/
function stubByPath(session: Response, onboardingDone = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      Promise.resolve(
        path === '/api/household/onboarding' ? json({ done: onboardingDone }) : session.clone(),
      ),
    ),
  );
}

/** Le compte et son second facteur, tels que GET /auth/session les dirait. */
function respondWith(
  session: { role: string; active: boolean; adminUnlocked: boolean },
  onboardingDone = true,
): void {
  stubByPath(
    json({
      account: { ...ACCOUNT, role: session.role },
      twoFactor: { active: session.active, adminUnlocked: session.adminUnlocked },
    }),
    onboardingDone,
  );
}

function respondAs(connected: boolean, onboardingDone = true): void {
  stubByPath(
    connected
      ? json({ account: ACCOUNT, twoFactor: { active: false, adminUnlocked: false } })
      : new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Authentification requise',
            status: 401,
            detail: 'Cette action demande une authentification.',
            requestId: '00000000-0000-4000-8000-000000000000',
          }),
          { status: 401, headers: { 'content-type': PROBLEM_DETAILS_MEDIA_TYPE } },
        ),
    onboardingDone,
  );
}

function createGuardedRouter(): Router {
  const router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  installSessionGuard(router);

  return router;
}

beforeEach(() => {
  resetSessionForTests();
  resetOnboardingForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('safeNextPath', () => {
  it('garde un chemin de cette application', () => {
    expect(safeNextPath('/planning?semaine=2')).toBe('/planning?semaine=2');
  });

  it('refuse tout ce qui mène ailleurs', () => {
    /*
      Une redirection ouverte : l'adresse de connexion est celle qu'on envoie
      par courriel, et son paramètre ne doit pas pouvoir emmener ailleurs après
      la connexion.

      La règle tient en deux conditions : commencer par une barre oblique, et
      pas par une seconde. Les cas ci-dessous sont les façons connues de
      contourner l'une ou l'autre.
    */
    for (const ailleurs of [
      // Adresse relative au protocole : le navigateur y lit un hôte.
      '//ailleurs.example/piege',
      '//',
      // La barre oblique inverse, que plusieurs navigateurs traitent comme //.
      '/\\ailleurs.example',
      '\\\\ailleurs.example',
      // Un schéma, en toutes casses, et un schéma qui exécute du code.
      'https://ailleurs.example',
      'HTTPS://AILLEURS.EXAMPLE',
      'javascript:alert(1)',
      'data:text/html,<script></script>',
      // Pas de barre oblique au début : résolu contre la page courante.
      'planning',
      'ailleurs.example/piege',
      // Une espace avant, qui ne fait pas de la valeur un chemin.
      ' //ailleurs.example',
      // Deux fois le paramètre : vue-router en fait un tableau.
      ['/un', '/deux'],
      undefined,
      '',
    ]) {
      expect(safeNextPath(ailleurs), `${JSON.stringify(ailleurs)} doit être écarté`).toBe('/');
    }
  });

  it('garde un chemin interne même quand il ressemble à une adresse', () => {
    /*
      Ce qui est contrôlé est la forme, et elle suffit : ces valeurs restent
      des chemins de cette origine, le navigateur les résolvant contre elle.
      Les garder évite de perdre la page demandée pour une ressemblance.
    */
    expect(safeNextPath('/%2F%2Failleurs.example')).toBe('/%2F%2Failleurs.example');
    expect(safeNextPath('/ailleurs.example')).toBe('/ailleurs.example');
    expect(safeNextPath('/')).toBe('/');
  });
});

describe('la garde de session', () => {
  it("renvoie à la connexion, en gardant l'adresse demandée", async () => {
    respondAs(false);

    const router = createGuardedRouter();

    await router.push('/?semaine=2');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query['suivant']).toBe('/?semaine=2');
  });

  it('laisse passer un compte connecté', async () => {
    respondAs(true);

    const router = createGuardedRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('home');
  });

  it("laisse la page de connexion ouverte à qui ne l'est pas", async () => {
    respondAs(false);

    const router = createGuardedRouter();

    await router.push('/connexion');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it('écarte la page de connexion quand on est déjà connecté', async () => {
    respondAs(true);

    const router = createGuardedRouter();

    await router.push('/connexion?suivant=/');

    expect(router.currentRoute.value.name).toBe('home');
  });

  it('protège aussi une adresse inconnue', async () => {
    // La page « introuvable » ne dit rien d'utile, mais elle montre la coquille
    // de l'application : sans session, on repart à la connexion.
    respondAs(false);

    const router = createGuardedRouter();

    await router.push('/une-adresse-qui-nexiste-pas');

    expect(router.currentRoute.value.name).toBe('login');
  });

  it("n'interroge le serveur qu'une fois pour plusieurs navigations", async () => {
    respondAs(true);

    const router = createGuardedRouter();

    await router.push('/');
    await router.push('/connexion');

    /*
      Deux appels, et deux seulement : qui est connecté, et si le premier
      lancement reste à faire. Ni l'un ni l'autre ne repart à la navigation
      suivante, et aucun des deux ne charge le profil.
    */
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map((call) => call[0])).toEqual([
      '/api/auth/session',
      '/api/household/onboarding',
    ]);
  });
});

describe('la garde du premier lancement', () => {
  it('conduit au parcours tant qu il reste à faire', async () => {
    respondAs(true, false);

    const router = createGuardedRouter();

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('onboarding');
  });

  it('laisse le parcours lui-même, sans boucler', async () => {
    respondAs(true, false);

    const router = createGuardedRouter();

    await router.push('/premier-lancement');

    expect(router.currentRoute.value.name).toBe('onboarding');
  });

  it('ne conduit plus au parcours une fois terminé', async () => {
    respondAs(true, true);

    const router = createGuardedRouter();

    await router.push('/profil');

    expect(router.currentRoute.value.name).toBe('household-profile');
  });

  it("laisse un administrateur régler son second facteur d'abord", async () => {
    /*
      Sans cette exception, un administrateur sans second facteur se
      retrouverait entre deux redirections : l'une vers le parcours, l'autre
      vers l'activation.
    */
    respondWith({ role: 'admin', active: false, adminUnlocked: false }, false);

    const router = createGuardedRouter();

    await router.push('/securite/double-authentification');

    expect(router.currentRoute.value.name).toBe('two-factor');
  });
});

describe("la garde de l'administration", () => {
  /*
    Trois conditions, et un écran par condition qui peut se corriger : le rôle
    n'en a pas, le second facteur et le déverrouillage en ont un (ADR 0012).

    Ce n'est pas ce qui protège l'administration : le serveur refuse ces routes
    de son côté, et ces tests ne mesurent que l'écran montré.
  */
  it('mène un compte ordinaire sur la page introuvable', async () => {
    respondWith({ role: 'user', active: false, adminUnlocked: false });

    const router = createGuardedRouter();

    await router.push('/administration');

    expect(router.currentRoute.value.name).toBe('not-found');
  });

  it("conduit un administrateur sans second facteur à l'activer", async () => {
    respondWith({ role: 'admin', active: false, adminUnlocked: false });

    const router = createGuardedRouter();

    await router.push('/administration/invitations');

    expect(router.currentRoute.value.name).toBe('two-factor');
  });

  it("conduit au déverrouillage, en gardant l'adresse demandée", async () => {
    // Le cas d'une session rouverte par le cookie de mémorisation.
    respondWith({ role: 'admin', active: true, adminUnlocked: false });

    const router = createGuardedRouter();

    await router.push('/administration/invitations');

    expect(router.currentRoute.value.name).toBe('admin-unlock');
    expect(router.currentRoute.value.query['suivant']).toBe('/administration/invitations');
  });

  it('laisse entrer un administrateur déverrouillé', async () => {
    respondWith({ role: 'admin', active: true, adminUnlocked: true });

    const router = createGuardedRouter();

    await router.push('/administration/invitations');

    expect(router.currentRoute.value.name).toBe('admin-invitations');
  });

  it("écarte l'écran de déverrouillage quand il n'y a plus rien à déverrouiller", async () => {
    respondWith({ role: 'admin', active: true, adminUnlocked: true });

    const router = createGuardedRouter();

    await router.push('/administration/deverrouillage');

    expect(router.currentRoute.value.name).toBe('admin');
  });

  it("laisse l'écran de déverrouillage à qui doit y passer", async () => {
    // Sans cette exception, la garde s'y renverrait en boucle.
    respondWith({ role: 'admin', active: true, adminUnlocked: false });

    const router = createGuardedRouter();

    await router.push('/administration/deverrouillage');

    expect(router.currentRoute.value.name).toBe('admin-unlock');
  });
});
