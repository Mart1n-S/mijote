import { SetMetadata } from '@nestjs/common';

/** Clé de métadonnée lue par la garde de session. */
export const TWO_FACTOR_PENDING_ROUTE = 'mijote.twoFactorPending';

/**
 * Route qui attend une **attente de connexion** et non une session.
 *
 * La garde de session résout alors le cookie d'attente au lieu du cookie de
 * session, et refuse en 401 s'il manque ou s'il a expiré. C'est ce qui permet à
 * la soumission du code de garder les trois barrières du CSRF : l'attente porte
 * son propre secret, donc la liste des routes exemptées reste à une entrée, la
 * connexion.
 */
export function TwoFactorPending(): MethodDecorator & ClassDecorator {
  return SetMetadata(TWO_FACTOR_PENDING_ROUTE, true);
}
