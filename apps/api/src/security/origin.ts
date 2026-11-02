/*
  Le contrôle d'origine, première barrière du CSRF.

  `Origin` est un en-tête interdit : une page ne peut pas le choisir, seul le
  navigateur l'écrit. Une requête inter-sites est donc reconnaissable sans
  aucun état côté serveur, ce qui est précisément ce qu'il faut pour protéger
  la connexion, où aucune session n'existe encore (voir l'ADR 0010).
*/

/** Ce que le contrôle lit de la requête, et rien de plus. */
export interface RequestOrigin {
  /** En-tête `Origin`, absent sur certaines requêtes de même origine. */
  origin: string | undefined;
  /** En-tête `Sec-Fetch-Site`, le repli quand `Origin` manque. */
  secFetchSite: string | undefined;
  /** Schéma vu par l'application, derrière le mandataire s'il est de confiance. */
  protocol: string;
  /** Hôte vu par l'application, port compris. */
  host: string | undefined;
}

/**
 * La requête vient-elle exactement de la même origine que l'application ?
 *
 * La comparaison porte sur l'origine **complète**, schéma, hôte et port : un
 * service voisin sur le même hôte en clair, ou sur un autre port, n'est pas la
 * même origine et n'a rien à faire ici.
 *
 * En repli, seul `same-origin` est accepté, jamais `same-site` : un autre
 * service sur un sous-domaine du même domaine est « same-site » et passerait.
 *
 * Les deux en-têtes absents, la requête est refusée. C'est le cas d'un client
 * qui n'est pas un navigateur, et qui n'a donc pas de cookie à détourner, mais
 * refuser est le bon défaut sur un chemin qui modifie l'état.
 */
export function isSameOrigin(request: RequestOrigin): boolean {
  if (request.host === undefined || request.host === '') {
    return false;
  }

  const expected = `${request.protocol}://${request.host}`;

  if (request.origin !== undefined && request.origin !== '') {
    // Comparaison insensible à la casse : le schéma et l'hôte ne le sont pas,
    // et un navigateur les écrit en minuscules, mais un mandataire peut
    // réécrire l'hôte autrement.
    return request.origin.toLowerCase() === expected.toLowerCase();
  }

  return request.secFetchSite === 'same-origin';
}
