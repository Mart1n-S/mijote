import { hash, verify } from '@node-rs/argon2';

import { createSecret } from './tokens.js';

/*
  Argon2id, et ses paramètres chiffrés.

  64 MiB de mémoire, trois passes, un seul degré de parallélisme. C'est
  nettement au-dessus du minimum de l'OWASP pour Argon2id (19 MiB, deux
  passes), et c'est mesuré : 109 ms de hachage et 124 ms de vérification dans
  un conteneur node:24, 140 ms sur le poste de développement. Les relevés et
  l'arbitrage sont dans l'ADR 0011.

  La mémoire est la vraie contrainte, pas le temps : chaque hachage réserve
  64 MiB, et le fil de travail de Node en traite quatre à la fois. La
  limitation des tentatives borne le reste.
*/

/*
  La valeur d'Argon2id, écrite en clair plutôt que lue dans l'énumération de la
  bibliothèque. Son `Algorithm` est un `const enum` ambiant : TypeScript refuse
  d'y accéder sous `isolatedModules`, et à l'exécution l'objet exporté est vide,
  donc `Algorithm.Argon2id` vaut `undefined`. La bibliothèque retomberait sur
  son défaut, qui est bien Argon2id, mais par chance et non par choix. Le test
  lit l'algorithme dans l'empreinte produite.
*/
const ARGON2ID = 2;

const PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const;

/** Douze caractères, comme l'exige l'issue #10. */
export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

/**
 * Le mot de passe correspond-il à l'empreinte ?
 *
 * Une empreinte illisible n'est pas attrapée ici : elle ne peut venir que
 * d'une ligne abîmée en base, et répondre « identifiants incorrects » la
 * cacherait. Elle remonte donc en 500 générique, journalisée par le filtre.
 */
export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  return verify(digest, password);
}

let decoyDigest: Promise<string> | undefined;

/**
 * Une empreinte leurre, à vérifier quand l'adresse est inconnue.
 *
 * Sans elle, une adresse inconnue répondrait sans payer le coût d'Argon2, et
 * le temps de réponse dirait quels comptes existent. Le message identique ne
 * suffit pas : il faut aussi le même temps.
 *
 * Calculée une fois, à la première tentative, sur un secret tiré au hasard que
 * personne ne connaît.
 */
export function decoyPasswordDigest(): Promise<string> {
  decoyDigest ??= hashPassword(createSecret());

  return decoyDigest;
}
