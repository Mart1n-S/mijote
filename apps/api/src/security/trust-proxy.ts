/*
  Le réglage `trust proxy` d'Express, décidé explicitement.

  L'application tourne derrière un mandataire inverse sur le homelab, donc
  `X-Forwarded-For` et `X-Forwarded-Proto` disent la vérité, mais seulement
  quand c'est bien le mandataire qui parle. Sans réglage, Express ignore ces
  en-têtes et la limitation compterait toutes les tentatives sur l'IP du
  mandataire. Avec une confiance aveugle, n'importe qui pourrait écrire
  l'en-tête lui-même et se donner une IP neuve à chaque essai.
*/

/** Par défaut, seule la boucle locale est crue : le cas du développement. */
export const DEFAULT_TRUST_PROXY = 'loopback';

/**
 * Lit `TRUST_PROXY` et rend la valeur à passer à Express.
 *
 * Un nombre est un nombre de sauts, une chaîne est une liste d'adresses ou de
 * noms de sous-réseaux (`loopback`, `uniquelocal`...). `true` est refusé : il
 * revient à croire n'importe quel client sur parole, ce qui désarme la
 * limitation des tentatives.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv): string | number | false {
  const raw = env['TRUST_PROXY']?.trim();

  if (raw === undefined || raw === '') {
    return DEFAULT_TRUST_PROXY;
  }

  if (raw === 'true') {
    throw new Error(
      "TRUST_PROXY=true ferait croire X-Forwarded-For à n'importe qui. Indiquer l'adresse du mandataire, un nombre de sauts, ou 'loopback'. Voir .env.example.",
    );
  }

  if (raw === 'false') {
    return false;
  }

  return /^\d+$/.test(raw) ? Number(raw) : raw;
}
