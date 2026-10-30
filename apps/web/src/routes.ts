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

// La table des routes est séparée de la création du routeur : createWebHistory
// touche à window dès l'import, ce qui la rendrait intestable hors navigateur.
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
    meta: { title: 'Accueil', navLabel: 'Accueil' },
  },
];
