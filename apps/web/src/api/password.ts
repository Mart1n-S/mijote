import { apiRequest } from './client';

/*
  Le mot de passe oublié, côté navigateur.

  Rien ici ne touche à l'état de session, contrairement à l'acceptation d'une
  invitation : une réinitialisation n'ouvre aucune session, et l'écran renvoie
  vers la connexion (ADR 0014).

  Le jeton n'apparaît dans aucune adresse appelée : il part dans le corps d'un
  POST. Une adresse se retrouve dans l'historique du navigateur, dans l'en-tête
  `Referer` et dans les journaux du mandataire.
*/

/**
 * Demande un lien de réinitialisation.
 *
 * La réponse est la même, et dans le même temps, que l'adresse ait un compte ou
 * non : l'appelant n'a donc rien à en déduire, et l'écran affiche un message
 * fixe.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Choisit un nouveau mot de passe, avec le jeton du lien reçu. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await apiRequest('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}
