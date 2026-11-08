import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { createRoutes } from '../routes';

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

function respondAs(connected: boolean): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        connected
          ? new Response(JSON.stringify({ account: ACCOUNT, twoFactor: { active: false, adminUnlocked: false } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
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
      ),
    ),
  );
}

function createGuardedRouter(): Router {
  const router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

  installSessionGuard(router);

  return router;
}

beforeEach(() => {
  resetSessionForTests();
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

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
