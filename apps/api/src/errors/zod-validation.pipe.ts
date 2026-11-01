import type { FieldError } from '@mijote/shared';
import type { PipeTransform } from '@nestjs/common';
import { z, type ZodError, type ZodType } from 'zod';
import { fr } from 'zod/locales';

import { ValidationException } from './validation.exception.js';

/*
  Les messages de zod sont en anglais par défaut. La locale française est posée
  à l'import de ce fichier, et `z.config` est **global au processus** : tout
  schéma analysé après cet import parle français, y compris ceux de
  packages/shared.

  Elle vit ici plutôt que dans main.ts pour une raison de mesure : le pipe est
  le seul endroit du projet qui transforme une erreur de schéma en message lu
  par un utilisateur, et son test vérifie donc la langue que la production
  produira vraiment. Un réglage posé au démarrage serait absent de ce test.
*/
z.config(fr());

/*
  Les champs refusés, dans l'ordre où zod les a rencontrés.

  Un segment de chemin ne peut être qu'une clé de propriété ou un indice de
  tableau, donc jamais une trace ni un chemin de fichier. Avec un `z.record()`
  ou un schéma `.strict()`, en revanche, ce segment serait une clé **envoyée par
  le client** : il faudra alors en borner la longueur. Aucun schéma du projet
  n'est dans ce cas.
*/
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
