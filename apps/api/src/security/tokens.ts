import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/*
  Les jetons opaques : session et mémorisation.

  Ils ne sont jamais stockés en clair. Une empreinte SHA-256 suffit, là où un
  mot de passe demande Argon2 : 32 octets tirés au hasard ne se devinent pas,
  donc il n'y a pas de dictionnaire à ralentir.
*/

/** 32 octets, soit 256 bits : hors de portée d'une recherche exhaustive. */
const SECRET_BYTES = 32;

/** Un secret opaque, en base64url : sûr dans un cookie comme dans une URL. */
export function createSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Compare deux empreintes à temps constant.
 *
 * La longueur est comparée d'abord, et ce n'est pas une fuite : ces empreintes
 * font toutes la même taille, qui n'est pas un secret. Ce qui compte est que
 * deux empreintes de même taille se comparent sans que le temps dise où elles
 * divergent.
 */
export function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');

  return a.length === b.length && timingSafeEqual(a, b);
}
