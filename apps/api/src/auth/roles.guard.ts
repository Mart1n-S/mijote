import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ProblemException } from '../errors/problem.exception.js';

import type { AccountRecord } from './auth.repository.js';
import { readAuthenticated } from './request-context.js';
import { REQUIRED_ROLES } from './roles.decorator.js';

const FORBIDDEN = "Cette action n'est pas autorisée.";

/**
 * La garde de rôle, globale et sans effet là où `@Roles()` n'est pas posé.
 *
 * Elle tourne après la garde de session, qui a rangé le compte sur la requête :
 * le rôle vient donc de la base, et jamais de ce que le client affirme.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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

    return true;
  }
}
