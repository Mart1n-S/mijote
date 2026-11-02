/** Jeton d'injection de l'envoyeur d'e-mails. */
export const MAILER = 'MAILER';

/**
 * Un message prêt à partir : le gabarit a déjà fait son travail.
 *
 * Les deux versions sont obligatoires. Le texte brut n'est pas une politesse :
 * certains clients ne lisent que lui, et c'est aussi ce qui reste lisible quand
 * le HTML est bloqué.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * L'envoi d'e-mails, vu par le reste de l'API.
 *
 * Une seule interface, pour que le fournisseur se choisisse au déploiement sans
 * toucher au code, et pour que les tests passent par une implémentation en
 * mémoire plutôt que par un vrai serveur.
 *
 * `send` échoue en levant une `ProblemException` : l'appelant n'a donc rien à
 * traduire, et le filtre global rend l'erreur au format RFC 9457.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}
