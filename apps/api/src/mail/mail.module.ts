import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { MAILER, type Mailer } from './mailer.js';
import { createMailTransport, readSmtpSettings, SmtpMailer } from './smtp.mailer.js';

/**
 * Branche l'envoi d'e-mails sur le SMTP décrit par l'environnement.
 *
 * Les réglages sont lus au démarrage, et leur absence l'arrête : une
 * configuration incomplète découverte à la première invitation serait découverte
 * trop tard.
 */
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: (logger: PinoLogger): Mailer => {
        const settings = readSmtpSettings(process.env);

        return new SmtpMailer(createMailTransport(settings), settings.from, logger);
      },
      inject: [PinoLogger],
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
