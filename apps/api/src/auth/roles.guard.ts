import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ProblemException } from '../errors/problem.exception.js';

import type { AccountRecord } from './auth.repository.js';
import { readAuthenticated } from './request-context.js';
import { REQUIRED_ROLES } from './roles.decorator.js';
import { TwoFactorService } from './two-factor.service.js';

const FORBIDDEN = "Cette action n'est pas autorisée.";

/**
 * Ce que répond une route d'administration à un administrateur qui n'a pas
 * encore inscrit d'application.
 *
 * Le second facteur est obligatoire pour ce rôle : rien ne le déconnecte, mais
 * aucune route d'administration ne l'accepte, et l'interface le conduit à
 * l'activer.
 */
export const TWO_FACTOR_SETUP_REQUIRED =
  'Cette action demande la double authentification. Activez-la pour continuer.';

/** Et à une session qui vaut pour l'application, mais pas pour l'administration. */
export const TWO_FACTOR_UNLOCK_REQUIRED =
  'Cette action demande un code de double authentification.';

/**
 * La garde de rôle, globale et sans effet là où `@Roles()` n'est pas posé.
 *
 * Elle tourne après la garde de session, qui a rangé le compte sur la requête :
 * le rôle vient donc de la base, et jamais de ce que le client affirme.
 *
 * Une route d'administration demande trois choses et non une : le rôle, un
 * second facteur **actif**, et une session qui l'a **validé** (ADR 0012). C'est
 * ce qui permet au cookie de mémorisation de rouvrir l'application sans rouvrir
 * l'administration.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AccountRecord['role'][]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required === undefined || required.length === 0) {
      return true;
    }

    const authenticated = readAuthenticated(context.switchToHttp().getRequest<unknown>());

    if (authenticated === undefined || !required.includes(authenticated.account.role)) {
      throw new ProblemException(HttpStatus.FORBIDDEN, FORBIDDEN);
    }

    /*
      La requête de plus ne coûte que sur les routes d'administration, qui sont
      rares : c'est elle qui distingue « pas encore activée » de « session à
      déverrouiller », donc qui permet de conduire au bon écran.
    */
    if (!(await this.twoFactor.isActive(authenticated.account.id))) {
      throw new ProblemException(HttpStatus.FORBIDDEN, TWO_FACTOR_SETUP_REQUIRED);
    }

    if (authenticated.session.adminUnlockedAt === null) {
      throw new ProblemException(HttpStatus.FORBIDDEN, TWO_FACTOR_UNLOCK_REQUIRED);
    }

    return true;
  }
}
