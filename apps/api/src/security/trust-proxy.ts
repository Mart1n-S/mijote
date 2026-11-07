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

/*
  Les écritures qui reviennent à croire tout le monde, et qui sont donc
  refusées au même titre que `true`.

  Ce contrôle attrape l'erreur évidente, pas une plage mal choisie : un `/8`
  trop large passera, et c'est au déploiement de nommer le mandataire.
*/
const CATCH_ALL = new Set(['0.0.0.0/0', '::/0', '*']);

/*
  Un mandataire inverse, parfois deux devant lui. Au-delà, le compte de sauts
  est une erreur de saisie, et chaque saut de trop est une adresse que le
  client choisit lui-même.
*/
const MAX_HOPS = 10;

/** La fin de chaque message de refus : la variable est documentée là. */
const SEE_EXAMPLE =
  "Indiquer l'adresse du mandataire, un nombre de sauts, ou 'loopback'. Voir .env.example.";

/**
 * Lit `TRUST_PROXY` et rend la valeur à passer à Express.
 *
 * Un nombre est un nombre de sauts, une chaîne est une liste d'adresses ou de
 * noms de sous-réseaux (`loopback`, `uniquelocal`...).
 *
 * Trois écritures sont refusées au démarrage, parce qu'elles reviennent toutes
 * à croire `X-Forwarded-For` de n'importe quel client, donc à désarmer la
 * limitation des tentatives et le contrôle d'origine : `true`, un préfixe qui
 * couvre tout l'espace d'adresses, et un nombre de sauts invraisemblable.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv): string | number | false {
  const raw = env['TRUST_PROXY']?.trim();

  if (raw === undefined || raw === '') {
    return DEFAULT_TRUST_PROXY;
  }

  if (raw === 'true') {
    throw new Error(
      `TRUST_PROXY=true ferait croire X-Forwarded-For à n'importe qui. ${SEE_EXAMPLE}`,
    );
  }

  if (raw === 'false') {
    return false;
  }

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);

    if (hops > MAX_HOPS) {
      throw new Error(
        `TRUST_PROXY=${raw} croirait ${raw} intermédiaires, ce qui laisse le client choisir son adresse. ${SEE_EXAMPLE}`,
      );
    }

    return hops;
  }

  const everyone = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .find((entry) => CATCH_ALL.has(entry));

  if (everyone !== undefined) {
    throw new Error(
      `TRUST_PROXY contient ${everyone}, qui couvre tout : c'est la confiance aveugle écrite autrement. ${SEE_EXAMPLE}`,
    );
  }

  return raw;
}
