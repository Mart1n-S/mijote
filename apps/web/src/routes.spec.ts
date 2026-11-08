import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { createRoutes } from './routes';

describe('createRoutes', () => {
  it("déclare la page d'accueil sur la racine", () => {
    const home = createRoutes(false).find((route) => route.name === 'home');

    expect(home?.path).toBe('/');
  });

  it("n'expose aucune page métier", () => {
    // L'égalité sur les noms et non un compte : la route de repli n'est pas
    // une page métier, mais elle fait nombre. Un écran ajouté par mégarde se
    // verrait ici.
    expect(createRoutes(false).map((route) => route.name)).toEqual([
      'home',
      'login',
      'two-factor',
      'not-found',
    ]);
  });

  it('attrape une adresse inconnue', () => {
    // Sans cette route, RouterView ne rend rien et l'utilisateur obtient un
    // main vide : ni titre, ni explication, ni moyen de repartir.
    const router = createRouter({ history: createMemoryHistory(), routes: createRoutes(false) });

    expect(router.resolve('/une-adresse-qui-nexiste-pas').name).toBe('not-found');
  });

  it('ajoute la page de démonstration quand on la demande', () => {
    const demo = createRoutes(true).find((route) => route.name === 'design-system');

    expect(demo?.path).toBe('/design-system');
  });

  it("n'ajoute pas la page de démonstration autrement", () => {
    // C'est ce que la production passe : la page ne doit pas y être atteignable.
    expect(createRoutes(false).some((route) => route.name === 'design-system')).toBe(false);
  });

  it("n'ouvre que la page de connexion", () => {
    /*
      L'application est privée : une page sans `public` demande une session, et
      c'est la garde qui le fait respecter. Une page ouverte par mégarde se
      verrait ici.
    */
    const open = createRoutes(true).flatMap((route) =>
      route.meta?.public === true ? [route.name] : [],
    );

    expect(open).toEqual(['login']);
  });

  it('ne met pas la connexion dans la navigation', () => {
    const login = createRoutes(false).find((route) => route.name === 'login');

    expect(login?.path).toBe('/connexion');
    expect(login?.meta?.navLabel).toBeUndefined();
  });

  it('place la double authentification sur une adresse française, hors navigation', () => {
    const page = createRoutes(false).find((route) => route.name === 'two-factor');

    expect(page?.path).toBe('/securite/double-authentification');
    // Ce n'est pas une destination : on y arrive par l'invitation de l'en-tête.
    expect(page?.meta?.navLabel).toBeUndefined();
    // Et elle demande une session, comme tout le reste.
    expect(page?.meta?.public).toBeUndefined();
  });

  it('donne un titre à chaque page', () => {
    // Le titre du document en dépend, à chaque changement de page.
    for (const route of createRoutes(true)) {
      expect(route.meta?.title).toBeTruthy();
    }
  });
});
