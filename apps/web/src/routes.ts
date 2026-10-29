import type { RouteRecordRaw } from 'vue-router';

import HomePage from './pages/HomePage.vue';

// La table des routes est séparée de la création du routeur : createWebHistory
// touche à window dès l'import, ce qui la rendrait intestable hors navigateur.
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
];
