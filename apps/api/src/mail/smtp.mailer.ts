import { HttpStatus } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createTransport } from 'nodemailer';

import { ProblemException } from '../errors/problem.exception.js';

import type { Mailer, MailMessage } from './mailer.js';

/** Les réglages SMTP, tels que l'environnement les donne. */
export interface SmtpSettings {
  host: string;
  port: number;
  /** TLS dès la connexion (port 465). Sur 587, STARTTLS se fait seul. */
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

/**
 * Ce que l'envoyeur demande au transport, et rien de plus.
 *
 * Forme réduite comme pour la sonde de base de données : elle permet de tester
 * l'envoyeur avec un faux transport de trois lignes, sans avoir à imiter le
 * `Transporter` entier de nodemailer.
 */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId: string; rejected: readonly unknown[] }>;
}

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} est absente de l'environnement. Voir .env.example.`);
  }

  return value.trim();
}

/** Lit et valide les réglages SMTP, en échouant au démarrage s'il en manque. */
export function readSmtpSettings(env: NodeJS.ProcessEnv): SmtpSettings {
  const port = Number(requireValue(env, 'SMTP_PORT'));

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(
      `SMTP_PORT vaut "${env['SMTP_PORT'] ?? ''}", qui n'est pas un numéro de port. Voir .env.example.`,
    );
  }

  // Vide vaut absent : Mailpit n'authentifie personne, et passer un
  // identifiant vide à nodemailer le ferait tenter une authentification.
  const user = env['SMTP_USER']?.trim();
  const password = env['SMTP_PASSWORD']?.trim();

  return {
    host: requireValue(env, 'SMTP_HOST'),
    port,
    secure: env['SMTP_SECURE']?.trim().toLowerCase() === 'true',
    user: user === '' ? undefined : user,
    password: password === '' ? undefined : password,
    from: requireValue(env, 'MAIL_FROM'),
  };
}

/**
 * Ouvre le transport SMTP.
 *
 * Le type de retour est la forme réduite : c'est lui qui fait vérifier au
 * compilateur que nodemailer la satisfait toujours.
 */
export function createMailTransport(settings: SmtpSettings): MailTransport {
  return createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    // Pas de bloc auth du tout quand il n'y a pas d'identifiant : nodemailer
    // tenterait sinon une authentification que Mailpit refuse.
    ...(settings.user === undefined
      ? {}
      : { auth: { user: settings.user, pass: settings.password } }),
  });
}

export class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SmtpMailer.name);
  }

  async send(message: MailMessage): Promise<void> {
    let sent: { messageId: string; rejected: readonly unknown[] };

    try {
      sent = await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      /*
        L'erreur n'est pas avalée : elle part au journal avec son contexte, et
        l'appelant reçoit un problème RFC 9457. L'API ne tombe pas pour un
        e-mail qui ne part pas.
      */
      this.logger.error({ err: error }, "envoi d'e-mail en échec");

      throw this.undeliverable();
    }

    if (sent.rejected.length > 0) {
      /*
        Le serveur a accepté la connexion mais refusé le destinataire. Seul le
        nombre est journalisé : `rejected` contient des adresses.
      */
      this.logger.error(
        { messageId: sent.messageId, rejected: sent.rejected.length },
        'destinataire refusé par le serveur SMTP',
      );

      throw this.undeliverable();
    }

    /*
      Seul l'identifiant du message. L'adresse du destinataire est une donnée
      personnelle et n'entre jamais dans un journal (security.md) ; c'est par
      cet identifiant qu'un envoi se retrouve, ici comme chez le fournisseur.
    */
    this.logger.info({ messageId: sent.messageId }, 'e-mail envoyé');
  }

  private undeliverable(): ProblemException {
    return new ProblemException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant.",
    );
  }
}
