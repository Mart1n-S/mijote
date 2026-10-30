import type { RouteRecordRaw } from 'vue-router';

import HomePage from './pages/HomePage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    /** Titre de la page, repris dans le titre du document. */
    title: string;
    /** Libellé dans la navigation principale. Absent, la page n'y figure pas. */
    navLabel?: string;
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

  if (withDesignSystem && designSystemPage !== undefined) {
    routes.push({
      path: '/design-system',
      name: 'design-system',
      component: designSystemPage,
      meta: { title: 'Design system', navLabel: 'Design system' },
    });
  }

  return routes;
}

// La table des routes est séparée de la création du routeur : createWebHistory
// touche à window dès l'import, ce qui la rendrait intestable hors navigateur.
export const routes = createRoutes(import.meta.env.MODE !== 'production');
