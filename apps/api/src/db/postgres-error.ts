/*
  Ce qu'on peut lire d'une erreur de PostgreSQL.

  Deux endroits en ont besoin, et pour deux raisons différentes : la commande
  `admin:create`, qui dit quoi corriger sans recopier ce qu'on lui a passé, et
  la demande de réinitialisation, qui doit distinguer un conflit d'unicité
  attendu d'une vraie panne (ADR 0014).
*/

/** `unique_violation` dans la table des codes d'erreur de PostgreSQL. */
const UNIQUE_VIOLATION = '23505';

/**
 * Le code d'erreur de PostgreSQL, quand il y en a un.
 *
 * Drizzle enveloppe l'erreur du pilote : le code vit donc sur l'erreur ou sur
 * sa cause, et il faut regarder les deux.
 */
export function readPostgresCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  for (const candidate of [error, error.cause]) {
    if (candidate instanceof Error && 'code' in candidate && typeof candidate.code === 'string') {
      return candidate.code;
    }
  }

  return undefined;
}

/**
 * Cette erreur est-elle le refus d'un index unique ?
 *
 * C'est le seul conflit que le projet traite comme un cas normal : il arrive
 * quand deux écritures concurrentes visent la même ligne vivante, et l'index
 * est précisément là pour que l'une des deux perde.
 */
export function isUniqueViolation(error: unknown): boolean {
  return readPostgresCode(error) === UNIQUE_VIOLATION;
}
