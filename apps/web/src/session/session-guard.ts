import type { RouteLocationRaw, Router } from 'vue-router';

import { ensureSessionLoaded, isAuthenticated } from './session';

/*
  La garde de navigation : l'application est privée, donc une page demande une
  session, sauf celles qui disent le contraire par `meta.public`.

  Elle double la garde du serveur, elle ne la remplace pas : ce qui protège les
  données, c'est l'API. Ici, il s'agit de ne pas montrer un écran vide à
  quelqu'un qui n'est pas connecté.
*/

/** Nom de la route de connexion, et nom du paramètre de retour. */
export const LOGIN_ROUTE = 'login';
export const NEXT_QUERY = 'suivant';

/**
 * Le chemin où revenir après la connexion.
 *
 * Seul un chemin de cette application est accepté : une valeur qui commence par
 * deux barres obliques, ou par un schéma, désigne un autre site, et renvoyer
 * l'utilisateur dessus après sa connexion serait une redirection ouverte.
 *
 * La forme est contrôlée, pas le contenu : le chemin demandé est recopié avec
 * sa chaîne de requête, donc **aucun écran ne doit porter de donnée personnelle
 * en paramètre de route**, sous peine de la voir arriver dans l'historique du
 * navigateur par l'adresse de connexion (voir l'ADR 0010).
 */
export function safeNextPath(value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/';
}

export function installSessionGuard(router: Router): void {
  router.beforeEach(async (to): Promise<RouteLocationRaw | boolean> => {
    /*
      Attendre ici, et non au démarrage de l'application : c'est le seul endroit
      qui voie aussi bien le premier affichage qu'un lien ouvert directement.
      L'appel ne part qu'une fois.
    */
    await ensureSessionLoaded();

    if (to.meta.public === true) {
      // Déjà connecté, la page de connexion n'a plus de raison d'être.
      return to.name === LOGIN_ROUTE && isAuthenticated.value
        ? { path: safeNextPath(to.query[NEXT_QUERY]) }
        : true;
    }

    return isAuthenticated.value
      ? true
      : { name: LOGIN_ROUTE, query: { [NEXT_QUERY]: to.fullPath } };
  });
}
