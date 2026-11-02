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
  }): Promise<{ messageId: string }>;
}

/*
  Une seule adresse, et rien qui ressemble à une liste ou à un en-tête.

  nodemailer découpe `to` sur la virgule : un « a@exemple.fr, b@ailleurs.fr »
  enverrait le message, donc le lien d'invitation et son jeton, aux deux. La
  validation de ce qu'un utilisateur a saisi appartient à la route qui le reçoit
  (schéma zod) ; ceci est l'invariant du dernier moment, à l'unique sortie.

  C'est aussi ce qui rend inutile un contrôle des destinataires refusés : avec
  une seule adresse, nodemailer ne rend jamais un envoi partiellement accepté,
  il rejette la promesse.
*/
const SINGLE_ADDRESS = /^[^\s,;<>"\r\n]+@[^\s,;<>"\r\n]+$/;

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
    /*
      Chiffrement exigé dès qu'il y a un identifiant à envoyer. Sans cette
      option, nodemailer ne passe en STARTTLS que si le serveur l'annonce : un
      serveur qui ne l'annonce pas, ou un intermédiaire qui retire la capacité
      de la réponse EHLO, laisse la session en clair, et `AUTH PLAIN` envoie
      alors l'identifiant et le mot de passe en base64 sur le réseau.

      Mailpit n'est pas concerné, son identifiant étant vide.
    */
    ...(settings.secure || settings.user === undefined ? {} : { requireTLS: true }),
    /*
      Les délais par défaut de nodemailer sont de 2 minutes pour la connexion et
      de 10 minutes pour la socket : un serveur qui accepte la connexion puis se
      tait retiendrait la requête HTTP d'une invitation tout ce temps, et autant
      de connexions que d'invitations demandées. L'échec retombe sur le 503
      ci-dessous.
    */
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    // Pas de bloc auth du tout quand il n'y a pas d'identifiant : nodemailer
    // tenterait sinon une authentification que Mailpit refuse.
    ...(settings.user === undefined
      ? {}
      : { auth: { user: settings.user, pass: settings.password } }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Ce qu'on garde d'une erreur d'envoi, et rien de plus.
 *
 * Ni le message, ni la pile, alors que la liste blanche des journaux les garde
 * partout ailleurs. La raison est mesurée dans nodemailer 10.3.1 : il ajoute la
 * réponse du serveur au message de l'erreur (`smtp-connection/index.js:935`),
 * et cette réponse cite l'adresse refusée (« 550 5.1.1 <qui@exemple.fr>:
 * Recipient address rejected ») ; il recopie même l'adresse telle quelle quand
 * il la juge invalide (`:1221`). Or une adresse e-mail n'entre dans aucun
 * journal (`security.md`).
 *
 * C'est le cas que le commentaire de `logging/logger-options.ts` annonçait : la
 * première erreur porteuse d'une donnée personnelle se journalise par ses
 * champs, pas en entier. La contrepartie est qu'un défaut de programmation sur
 * ce chemin ne laisse que son type ; l'identifiant de requête, lui, reste là
 * pour relier la ligne à la réponse.
 */
function describeFailure(error: unknown): Record<string, unknown> {
  if (!isRecord(error)) {
    return { type: typeof error };
  }

  return {
    type: error instanceof Error ? error.name : 'unknown',
    /*
      Les trois champs que nodemailer accroche à ses erreurs SMTP, et dont aucun
      ne peut porter une adresse : son propre code ('EENVELOPE', 'ECONNECTION',
      'ETIMEDOUT'), le code de réponse du serveur (550) et la commande en cours
      ('RCPT TO').
    */
    code: readString(error['code']),
    responseCode: typeof error['responseCode'] === 'number' ? error['responseCode'] : undefined,
    command: readString(error['command']),
  };
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
    if (!SINGLE_ADDRESS.test(message.to)) {
      /*
        Un défaut de programmation, pas une panne de service : l'appelant devait
        valider la saisie. Le message ne cite pas la valeur reçue, qui irait
        alors au journal par la pile de cette erreur.
      */
      throw new Error("l'adresse du destinataire n'est pas une adresse unique");
    }

    let sent: { messageId: string };

    try {
      sent = await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      /*
        L'erreur n'est pas avalée : ses champs partent au journal, et l'appelant
        reçoit un problème RFC 9457. L'API ne tombe pas pour un e-mail qui ne
        part pas.
      */
      this.logger.error(describeFailure(error), "envoi d'e-mail en échec");

      throw new ProblemException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "L'e-mail n'a pas pu être envoyé. Réessayez dans un instant.",
      );
    }

    /*
      Seul l'identifiant du message. L'adresse du destinataire est une donnée
      personnelle et n'entre jamais dans un journal (security.md) ; c'est par
      cet identifiant qu'un envoi se retrouve, ici comme chez le fournisseur.
    */
    this.logger.info({ messageId: sent.messageId }, 'e-mail envoyé');
  }
}
