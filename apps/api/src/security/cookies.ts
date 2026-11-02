/*
  Les cookies, écrits et relus à la main.

  Express 5 n'analyse pas les cookies et Node n'a rien pour cela. Le besoin est
  petit et stable : trois cookies connus, des valeurs opaques, les mêmes
  attributs partout. C'est le même arbitrage que les en-têtes de sécurité de
  l'issue #31, qui ont écarté `helmet` pour la même raison, et cela évite une
  dépendance de plus sur le chemin le plus sensible de l'application.
*/

export interface CookieAttributes {
  /**
   * Durée de vie en secondes. Absente, le cookie meurt à la fermeture du
   * navigateur : c'est la durée courte par défaut de la session.
   */
  maxAgeSeconds?: number;
  /**
   * Lisible par le script de la page. Faux partout, sauf pour le jeton CSRF,
   * que le front doit renvoyer en en-tête.
   */
  readableByScript?: boolean;
}

/*
  Ce qu'une valeur de cookie peut contenir ici : les jetons sont en base64url
  et les identifiants sont des UUID. Tout le reste est refusé plutôt
  qu'encodé, parce qu'une valeur inattendue sur ce chemin est un défaut de
  programmation, et qu'un point-virgule ou un retour chariot qui passerait
  permettrait d'écrire d'autres en-têtes.
*/
const SAFE_VALUE = /^[A-Za-z0-9._~-]*$/;

/** Sérialise un cookie avec les attributs du projet, les mêmes pour tous. */
export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  if (!SAFE_VALUE.test(value)) {
    throw new Error(`valeur de cookie refusée pour ${name} : caractère interdit`);
  }

  const parts = [`${name}=${value}`, 'Path=/', 'SameSite=Lax'];

  /*
    Secure sans condition, y compris en développement : les navigateurs
    traitent http://localhost comme une origine sûre et acceptent donc un
    cookie Secure. Un drapeau qui dépendrait de l'environnement serait une
    occasion de livrer un cookie en clair.
  */
  parts.push('Secure');

  if (attributes.readableByScript !== true) {
    parts.push('HttpOnly');
  }

  if (attributes.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.floor(attributes.maxAgeSeconds).toString()}`);
  }

  return parts.join('; ');
}

/** L'en-tête qui efface un cookie, avec les mêmes attributs que sa pose. */
export function expireCookie(name: string, attributes: CookieAttributes = {}): string {
  return serializeCookie(name, '', { ...attributes, maxAgeSeconds: 0 });
}

/**
 * La valeur d'un cookie dans un en-tête `Cookie`.
 *
 * Le premier gagne, comme le font les navigateurs : un attaquant qui réussit à
 * poser un second cookie de même nom ne doit pas pouvoir remplacer le premier.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) {
    return undefined;
  }

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');

    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      const value = pair.slice(separator + 1).trim();

      return SAFE_VALUE.test(value) ? value : undefined;
    }
  }

  return undefined;
}
