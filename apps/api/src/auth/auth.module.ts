import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from '../db/database.module.js';

import { AttemptsService } from './attempts.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { PendingLoginService } from './pending-login.service.js';
import { RememberService } from './remember.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';
import { TwoFactorService } from './two-factor.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AttemptsService,
    SessionService,
    RememberService,
    PendingLoginService,
    TwoFactorService,
    AuthService,
    /*
      Les trois gardes sont globales, dans cet ordre, qui est celui de leur
      déclaration : la session d'abord, parce que les deux suivantes ont besoin
      de ce qu'elle a résolu ; le CSRF ensuite, pour qu'une requête forgée soit
      refusée avant qu'on se demande si son rôle lui donnait le droit ; le rôle
      en dernier.

      Globales, donc fermées par défaut : une route nouvelle demande une session
      sans que personne ait à y penser, et c'est `@Public()` qui l'ouvre.
    */
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  /*
    `AttemptsService` est exporté : la limitation est une facilité partagée, et
    les invitations comptent leurs propres tentatives sous leur propre motif.
  */
  exports: [AuthService, SessionService, AttemptsService],
})
export class AuthModule {}
