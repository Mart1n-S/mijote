import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ProblemException } from '../errors/problem.exception.js';

import { PENDING_COOKIE, SESSION_COOKIE } from './auth.cookies.js';
import { PendingLoginService } from './pending-login.service.js';
import { PUBLIC_ROUTE } from './public.decorator.js';
import { attachAuthenticated, attachPendingLogin, readRequestCookie } from './request-context.js';
import { SessionService } from './session.service.js';
import { TWO_FACTOR_PENDING_ROUTE } from './two-factor.decorator.js';

/** Le détail du 401, partagé avec la route qui dit qui est connecté. */
export const AUTH_REQUIRED = 'Cette action demande une authentification.';

/**
 * Le détail du 401 sur la soumission du code.
 *
 * Il ne dépend d'aucune donnée : l'attente a expiré, ou son cookie n'est pas
 * là. Dans les deux cas, il faut repasser par le mot de passe.
 */
export const PENDING_EXPIRED = 'La vérification a expiré. Recommencez la connexion.';

/**
 * La garde d'authentification, globale : tout demande une session, sauf ce que
 * `@Public()` ouvre explicitement.
 *
 * Elle ne reprend **pas** une session depuis le cookie de mémorisation : cela
 * n'arrive que sur `GET /auth/session`, que le front appelle au démarrage. Une
 * garde qui poserait des cookies au passage de n'importe quelle requête serait
 * beaucoup plus difficile à suivre.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly pending: PendingLoginService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<unknown>();

    /*
      La soumission du code n'a pas de session, et n'est pas ouverte pour
      autant : elle demande une attente valide, et c'est cette attente qui
      portera le secret CSRF que la garde suivante comparera.
    */
    if (this.reflector.getAllAndOverride<boolean>(TWO_FACTOR_PENDING_ROUTE, targets) === true) {
      const waitingToken = readRequestCookie(request, PENDING_COOKIE);
      const waiting =
        waitingToken === undefined ? undefined : await this.pending.resolve(waitingToken);

      if (waiting === undefined) {
        throw new ProblemException(HttpStatus.UNAUTHORIZED, PENDING_EXPIRED);
      }

      attachPendingLogin(request, waiting);

      return true;
    }

    const token = readRequestCookie(request, SESSION_COOKIE);
    const authenticated = token === undefined ? undefined : await this.sessions.resolve(token);

    if (authenticated === undefined) {
      // Cookie absent, session fermée ou expirée : le même 401, parce que la
      // réponse n'a rien à apprendre à qui frappe à la porte.
      throw new ProblemException(HttpStatus.UNAUTHORIZED, AUTH_REQUIRED);
    }

    attachAuthenticated(request, authenticated);

    return true;
  }
}
