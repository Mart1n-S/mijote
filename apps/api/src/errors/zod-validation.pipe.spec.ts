import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ValidationException } from './validation.exception.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/*
  Le pipe est une classe sans dépendance : il s'instancie et s'appelle
  directement, sans conteneur NestJS. Ce que le navigateur reçoit de ces
  exceptions est mesuré ailleurs, dans app.http.spec.ts, à travers le filtre.
*/
describe('ZodValidationPipe', () => {
  const schema = z.object({
    size: z.number().int().positive(),
    household: z.object({ name: z.string().min(1) }),
  });

  it('rend la valeur analysée quand elle est valide', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ size: 2, household: { name: 'Simon' } })).toEqual({
      size: 2,
      household: { name: 'Simon' },
    });
  });

  it('nomme chaque champ fautif par son chemin complet', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ size: -1, household: { name: '' } });
      expect.unreachable('le pipe devait refuser cette entrée');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);

      const fields =
        error instanceof ValidationException ? error.fieldErrors.map((item) => item.field) : [];

      expect(fields).toEqual(['size', 'household.name']);
    }
  });

  it('donne des messages en français', () => {
    const pipe = new ZodValidationPipe(z.object({ size: z.number() }));

    try {
      pipe.transform({ size: 'deux' });
      expect.unreachable('le pipe devait refuser cette entrée');
    } catch (error) {
      const messages =
        error instanceof ValidationException ? error.fieldErrors.map((item) => item.message) : [];

      // La locale française de zod est posée par le pipe lui-même. Sans elle,
      // le message serait « Invalid input: expected number, received string ».
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatch(/attendu|nombre|reçu/i);
    }
  });

  it("nomme le corps lui-même quand ce n'est pas un objet", () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform('pas un objet');
      expect.unreachable('le pipe devait refuser cette entrée');
    } catch (error) {
      const fields =
        error instanceof ValidationException ? error.fieldErrors.map((item) => item.field) : [];

      expect(fields).toEqual(['body']);
    }
  });
});
