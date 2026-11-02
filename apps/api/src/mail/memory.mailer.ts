import type { Mailer, MailMessage } from './mailer.js';

/**
 * Envoyeur en mémoire : il garde les messages et n'envoie rien.
 *
 * C'est l'implémentation des tests, y compris de ceux des stories à venir qui
 * vérifieront le contenu d'une invitation sans avoir besoin d'un serveur SMTP.
 */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);

    return Promise.resolve();
  }
}
