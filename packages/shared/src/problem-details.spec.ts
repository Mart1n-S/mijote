import { describe, expect, it } from 'vitest';

import { problemDetailsSchema } from './problem-details.js';

/*
  Le schéma est la seule garantie que les deux applications parlent du même
  format : ces tests fixent ce qu'il accepte et ce qu'il refuse. Ils valent donc
  pour le filtre de l'API comme pour le client du front.
*/
describe('problemDetailsSchema', () => {
  const valid = {
    type: 'about:blank',
    title: 'Ressource introuvable',
    status: 404,
    detail: "Cette adresse n'existe pas.",
    requestId: '1a2b3c',
  };

  it('accepte un problème sans liste de champs', () => {
    expect(problemDetailsSchema.safeParse(valid).success).toBe(true);
  });

  it('accepte une liste de champs en erreur', () => {
    const result = problemDetailsSchema.safeParse({
      ...valid,
      status: 400,
      errors: [{ field: 'household.size', message: 'Doit être un nombre.' }],
    });

    expect(result.success).toBe(true);
  });

  it('refuse un statut qui arrive en texte', () => {
    // Le cas concret est une réponse d'un intermédiaire (serveur mandataire,
    // page d'erreur d'un répartiteur) qui n'est pas celle de l'API.
    expect(problemDetailsSchema.safeParse({ ...valid, status: '404' }).success).toBe(false);
  });

  it('refuse un problème sans identifiant de requête', () => {
    const withoutRequestId: Record<string, unknown> = { ...valid };

    delete withoutRequestId['requestId'];

    expect(problemDetailsSchema.safeParse(withoutRequestId).success).toBe(false);
  });

  it('refuse un champ en erreur incomplet', () => {
    const result = problemDetailsSchema.safeParse({
      ...valid,
      errors: [{ field: 'household.size' }],
    });

    expect(result.success).toBe(false);
  });
});
