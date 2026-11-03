import { createRouter, createWebHistory } from 'vue-router';

import { installNavigationFeedback } from './navigation';
import { routes } from './routes';
import { installSessionGuard } from './session/session-guard';

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

/*
  La garde de session d'abord : elle décide si la navigation a lieu, et le
  retour de navigation (titre, focus) n'a de sens qu'ensuite.
*/
installSessionGuard(router);
installNavigationFeedback(router);
