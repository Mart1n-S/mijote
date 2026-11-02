import { SetMetadata } from '@nestjs/common';

/** Clé de métadonnée lue par la garde de session. */
export const PUBLIC_ROUTE = 'mijote.public';

/**
 * Ouvre une route sans session.
 *
 * La garde de session est globale : par défaut, **tout** demande une session, et
 * une route ouverte doit le dire. C'est le bon sens du défaut : oublier ce
 * décorateur ferme une route, l'oublier dans l'autre sens l'ouvrirait.
 */
export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(PUBLIC_ROUTE, true);
}
