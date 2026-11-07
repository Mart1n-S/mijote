import { CSRF_COOKIE } from '@mijote/shared';

import { expireCookie, serializeCookie } from '../security/cookies.js';

/*
  Les trois cookies de la connexion, et les durées de la story #10.

  Le nom du cookie CSRF et celui de son en-tête vivent dans packages/shared :
  le front doit lire l'un pour écrire l'autre. Les deux autres cookies ne
  sortent jamais de l'API, le navigateur étant seul à les porter.
*/

export const SESSION_COOKIE = 'mijote_session';
export const REMEMBER_COOKIE = 'mijote_remember';

/** Durées validées le 3 novembre 2026, voir l'ADR 0010. */
export const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Le cookie de session, sans `Max-Age`.
 *
 * C'est la durée courte par défaut : fermer le navigateur ferme la session, et
 * seule la mémorisation explicite permet de la reprendre.
 */
export function sessionCookie(token: string): string {
  return serializeCookie(SESSION_COOKIE, token, {});
}

/** Le cookie de mémorisation, trente jours, illisible par le script. */
export function rememberCookie(value: string): string {
  return serializeCookie(REMEMBER_COOKIE, value, {
    maxAgeSeconds: Math.floor(REMEMBER_TTL_MS / 1000),
  });
}

/**
 * Le cookie du jeton CSRF, le seul que le script de la page peut lire.
 *
 * Il porte la même valeur que la colonne `csrf_secret` de la session : le front
 * la relit pour la renvoyer en en-tête, et le serveur compare les deux. Une
 * page d'un autre site ne peut ni lire ce cookie, ni donc écrire l'en-tête.
 */
export function csrfCookie(secret: string): string {
  return serializeCookie(CSRF_COOKIE, secret, { readableByScript: true });
}

/** Les en-têtes qui effacent les trois cookies, à la déconnexion. */
export function clearedCookies(): string[] {
  return [
    expireCookie(SESSION_COOKIE),
    expireCookie(REMEMBER_COOKIE),
    expireCookie(CSRF_COOKIE, { readableByScript: true }),
  ];
}
