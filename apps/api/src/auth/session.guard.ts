import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ProblemException } from '../errors/problem.exception.js';

import { SESSION_COOKIE } from './auth.cookies.js';
import { PUBLIC_ROUTE } from './public.decorator.js';
import { attachAuthenticated, readRequestCookie } from './request-context.js';
import { SessionService } from './session.service.js';

/** Le détail du 401, partagé avec la route qui dit qui est connecté. */
export const AUTH_REQUIRED = 'Cette action demande une authentification.';

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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<unknown>();
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
