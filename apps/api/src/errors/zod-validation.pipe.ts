import type { FieldError } from '@mijote/shared';
import type { PipeTransform } from '@nestjs/common';
import { z, type ZodError, type ZodType } from 'zod';
import { fr } from 'zod/locales';

import { ValidationException } from './validation.exception.js';

/*
  Les messages de zod sont en anglais par défaut. La locale française est posée
  une fois, à l'import de ce fichier, parce que ce pipe est le seul endroit du
  projet qui transforme une erreur zod en message destiné à un utilisateur. Un
  schéma analysé ailleurs, sans passer par ici, parlerait anglais : c'est voulu,
  ses messages ne sortent pas de l'API.
*/
z.config(fr());

/** Les champs refusés, dans l'ordre où zod les a rencontrés. */
function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    // Un chemin vide désigne le corps lui-même : un objet attendu et une
    // chaîne reçue, par exemple.
    field: issue.path.length === 0 ? 'body' : issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/**
 * Valide une entrée par un schéma zod, et rend la valeur analysée, typée.
 *
 * S'instancie avec son schéma à l'endroit où il s'applique :
 * `@Body(new ZodValidationPipe(createAccountSchema))`. Les schémas d'une route
 * vivent dans `packages/shared` quand le front en a besoin pour son formulaire.
 */
export class ZodValidationPipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly schema: ZodType<Output>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationException(toFieldErrors(result.error));
    }

    return result.data;
  }
}
