import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router';

import {
  currentAccount,
  ensureSessionLoaded,
  isAuthenticated,
  mustActivateTwoFactor,
  mustUnlockAdmin,
} from './session';

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

/** Les trois routes où la garde conduit un administrateur mal équipé. */
export const ADMIN_ROUTE = 'admin';
export const ADMIN_UNLOCK_ROUTE = 'admin-unlock';
export const TWO_FACTOR_ROUTE = 'two-factor';

/**
 * Le repli, où est conduit un compte ordinaire qui tape une adresse
 * d'administration.
 *
 * Une page introuvable, et non un refus : pour ce compte, cette page n'existe
 * pas, et lui annoncer qu'elle existe mais lui est fermée ne lui apprendrait
 * rien d'utile.
 */
export const NOT_FOUND_ROUTE = 'not-found';

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

    if (!isAuthenticated.value) {
      return { name: LOGIN_ROUTE, query: { [NEXT_QUERY]: to.fullPath } };
    }

    return to.meta.admin === true ? adminDestination(to) : true;
  });
}

/**
 * Où conduire quelqu'un qui demande une page d'administration.
 *
 * Trois conditions, dans cet ordre : le rôle, le second facteur, puis le code
 * validé dans cette session (ADR 0012). Les deux dernières ont un écran ; la
 * première n'en a pas, un compte ordinaire n'ayant rien à y faire.
 *
 * L'écran de déverrouillage porte lui aussi `meta.admin`, parce qu'il demande
 * le rôle et le second facteur : d'où les deux exceptions sur son nom, l'une
 * pour ne pas s'y renvoyer en boucle, l'autre pour ne pas l'afficher quand il
 * n'y a plus rien à déverrouiller.
 */
function adminDestination(to: RouteLocationNormalized): RouteLocationRaw | boolean {
  if (currentAccount.value?.role !== 'admin') {
    return { name: NOT_FOUND_ROUTE, params: { pathMatch: to.path.slice(1).split('/') } };
  }

  if (mustActivateTwoFactor.value) {
    return { name: TWO_FACTOR_ROUTE };
  }

  if (mustUnlockAdmin.value) {
    return to.name === ADMIN_UNLOCK_ROUTE
      ? true
      : { name: ADMIN_UNLOCK_ROUTE, query: { [NEXT_QUERY]: to.fullPath } };
  }

  return to.name === ADMIN_UNLOCK_ROUTE ? { name: ADMIN_ROUTE } : true;
}
