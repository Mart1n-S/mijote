import type { RouteRecordRaw } from 'vue-router';

import HomePage from './pages/HomePage.vue';
import LoginPage from './pages/LoginPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import TwoFactorPage from './pages/TwoFactorPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Titre de la page, repris dans le titre du document. */
    title: string;
    /** Libellé dans la navigation principale. Absent, la page n'y figure pas. */
    navLabel?: string;
    /**
     * Accessible sans session. Absent, la page en demande une : l'application
     * est privée, et le défaut doit être le plus fermé des deux.
     */
    public?: boolean;
  }
}

/*
  La page de démonstration ne doit pas partir dans le paquet livré. La
  condition est donc écrite ici, au niveau du module, et non dans la fonction
  en dessous : import.meta.env.MODE est remplacé à la compilation, la branche
  devient du code mort et l'import dynamique disparaît avec elle. Placée dans
  la fonction, la même condition laissait le greffon émettre le fragment, parce
  que le corps de la fonction, lui, reste bien vivant.
*/
const designSystemPage =
  import.meta.env.MODE === 'production' ? undefined : () => import('./pages/DesignSystemPage.vue');

/**
 * La table des routes. La page de démonstration du design system n'est pas une
 * page de l'application : elle n'est ajoutée que là où elle a un sens, et elle
 * n'est de toute façon pas construite en production.
 */
export function createRoutes(withDesignSystem: boolean): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = [
    {
      path: '/',
      name: 'home',
      component: HomePage,
      meta: { title: 'Accueil', navLabel: 'Accueil' },
    },
  ];

  /*
    La connexion est la seule page ouverte, et elle ne figure pas dans la
    navigation : on y arrive par la garde, ou parce qu'on n'est pas connecté.
    Import statique, c'est le premier écran d'une visite sans session.
  */
  routes.push({
    path: '/connexion',
    name: 'login',
    component: LoginPage,
    meta: { title: 'Connexion', public: true },
  });

  /*
    La double authentification : une page de compte, qui demande une session.
    Elle ne figure pas dans la navigation : on y arrive par l'invitation de
    l'en-tête quand elle manque, ou par un lien direct.
  */
  routes.push({
    path: '/securite/double-authentification',
    name: 'two-factor',
    component: TwoFactorPage,
    meta: { title: 'Double authentification' },
  });

  if (withDesignSystem && designSystemPage !== undefined) {
    routes.push({
      path: '/design-system',
      name: 'design-system',
      component: designSystemPage,
      meta: { title: 'Design system', navLabel: 'Design system' },
    });
  }

  /*
    Le repli vient en dernier, et hors de toute condition : une URL inconnue
    est servie par la bascule SPA, et sans cette route RouterView ne rend rien.
    L'utilisateur obtient alors un main vide, sans titre, sans explication et
    sans moyen de repartir. Import statique, la page devant exister en
    production, où le défaut se produit le plus.
  */
  routes.push({
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
    // Pas de navLabel : ce n'est pas une destination, elle n'a rien à faire
    // dans la barre de navigation.
    meta: { title: 'Page introuvable' },
  });

  return routes;
}

// La table des routes est séparée de la création du routeur : createWebHistory
// touche à window dès l'import, ce qui la rendrait intestable hors navigateur.
export const routes = createRoutes(import.meta.env.MODE !== 'production');
