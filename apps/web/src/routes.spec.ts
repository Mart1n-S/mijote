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
      'onboarding',
      'household-profile',
      'privacy',
      'login',
      'forgot-password',
      'reset-password',
      'two-factor',
      'invitation',
      'admin',
      'admin-unlock',
      'admin-invitations',
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

  it("n'ouvre que la confidentialité, la connexion, le mot de passe oublié et l'invitation", () => {
    /*
      L'application est privée : une page sans `public` demande une session, et
      c'est la garde qui le fait respecter. Une page ouverte par mégarde se
      verrait ici.

      Les autres ne peuvent pas être autrement. L'invitation est là où le compte
      se crée, donc il n'y a par définition pas encore de session, et son
      pouvoir vient du jeton du lien (ADR 0013). Les deux pages du mot de passe
      oublié sont faites pour quelqu'un qui ne peut justement pas se connecter
      (ADR 0014). Et la page de confidentialité doit se lire avant de créer un
      compte (ADR 0017).
    */
    const open = createRoutes(true).flatMap((route) =>
      route.meta?.public === true ? [route.name] : [],
    );

    expect(open).toEqual(['privacy', 'login', 'forgot-password', 'reset-password', 'invitation']);
  });

  it('place le mot de passe oublié sur des adresses françaises, hors navigation', () => {
    const pages = createRoutes(false).flatMap((route) =>
      route.name === 'forgot-password' || route.name === 'reset-password'
        ? [{ path: route.path, nav: route.meta?.navLabel }]
        : [],
    );

    /*
      Le second chemin est celui que l'e-mail porte, fragment compris : le
      changer casse les liens déjà partis, et il doit rester celui que
      `password-reset.service.ts` construit côté API.
    */
    expect(pages).toEqual([
      { path: '/mot-de-passe-oublie', nav: undefined },
      { path: '/mot-de-passe/reinitialisation', nav: undefined },
    ]);
  });

  it("réserve l'administration, et n'en montre que l'entrée dans la navigation", () => {
    const admin = createRoutes(true).flatMap((route) =>
      route.meta?.admin === true ? [{ name: route.name, nav: route.meta.navLabel }] : [],
    );

    /*
      L'écran de déverrouillage en fait partie : il demande le rôle et le second
      facteur, et la garde l'excepte du renvoi vers lui-même.
    */
    expect(admin).toEqual([
      { name: 'admin', nav: 'Administration' },
      { name: 'admin-unlock', nav: undefined },
      { name: 'admin-invitations', nav: undefined },
    ]);
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
