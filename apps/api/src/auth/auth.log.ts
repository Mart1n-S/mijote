/**
 * Ce que les services de connexion journalisent, et rien de plus.
 *
 * La forme réduite plutôt que `PinoLogger` entier : les tests de la connexion
 * relisent les lignes écrites, et c'est ainsi qu'ils vérifient qu'un mot de
 * passe, un jeton ou une adresse n'y figure jamais (api.md).
 */
export interface AuthLog {
  setContext(context: string): void;
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
}
