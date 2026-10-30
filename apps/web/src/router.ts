import { createRouter, createWebHistory } from 'vue-router';

import { installNavigationFeedback } from './navigation';
import { routes } from './routes';

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

installNavigationFeedback(router);
