import type { FieldError } from '@mijote/shared';
import { BadRequestException } from '@nestjs/common';

/**
 * Entrée refusée par la validation. Elle porte la liste des champs fautifs, que
 * le filtre recopie dans le membre d'extension `errors` du problème RFC 9457.
 *
 * Une exception propre plutôt qu'un `BadRequestException` chargé d'un objet :
 * le filtre reconnaît alors le cas par son type, et non en devinant la forme de
 * ce qu'il a reçu.
 */
export class ValidationException extends BadRequestException {
  constructor(readonly fieldErrors: readonly FieldError[]) {
    super('La requête contient des champs invalides.');
  }
}
