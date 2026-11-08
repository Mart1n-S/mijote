import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './db/database.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { ProblemDetailsFilter } from './errors/problem-details.filter.js';
import { HealthModule } from './health/health.module.js';
import { buildLoggerParams } from './logging/logger-options.js';
import { MailModule } from './mail/mail.module.js';

@Module({
  imports: [
    /*
      forRootAsync et non forRoot : les options liraient sinon process.env au
      moment où ce module est importé, c'est-à-dire avant que main.ts n'ait
      chargé le .env (un import ESM est évalué avant le corps du fichier qui
      l'importe). La fabrique, elle, tourne à la création de l'application.
    */
    LoggerModule.forRootAsync({ useFactory: () => buildLoggerParams(process.env) }),
    DatabaseModule,
    /*
      AuthModule pose trois gardes globales : à partir d'ici, toute route de
      l'application demande une session, sauf celles qui portent `@Public()`.
    */
    AuthModule,
    MailModule,
    InvitationsModule,
    HealthModule,
  ],
  providers: [
    // Toutes les erreurs de l'application sortent par ce filtre, y compris
    // celles que NestJS lève lui-même (route inconnue, corps illisible).
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
