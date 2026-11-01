import type { FieldError } from '@mijote/shared';
import { HttpStatus } from '@nestjs/common';

import { ProblemException } from './problem.exception.js';

/**
 * Entrée refusée par la validation. Elle porte la liste des champs fautifs, que
 * le filtre recopie dans le membre d'extension `errors` du problème RFC 9457.
 *
 * Une exception propre plutôt qu'un `BadRequestException` chargé d'un objet :
 * le filtre reconnaît alors le cas par son type, et non en devinant la forme de
 * ce qu'il a reçu.
 */
export class ValidationException extends ProblemException {
  constructor(readonly fieldErrors: readonly FieldError[]) {
    super(HttpStatus.BAD_REQUEST, 'La requête contient des champs invalides.');
  }
}
