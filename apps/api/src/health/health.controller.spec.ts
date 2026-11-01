import { describe, expect, it } from 'vitest';

import { ProblemException } from '../errors/problem.exception.js';

import { HealthController } from './health.controller.js';

// Le contrôleur est instancié directement plutôt que par le conteneur Nest :
// Rolldown, qui transforme les fichiers pour Vitest, n'émet pas les métadonnées
// de emitDecoratorMetadata, donc l'injection de dépendances n'est pas
// disponible dans les tests. Voir l'ADR 0002.
//
// Le cas où la base répond ne se mesure qu'ici : app.http.spec.ts monte
// l'application sans PostgreSQL, donc il ne voit que le 503.
describe('HealthController', () => {
  it('répond ok quand la base répond', async () => {
    const controller = new HealthController({ isDatabaseReachable: () => Promise.resolve(true) });

    expect(await controller.check()).toEqual({ status: 'ok' });
  });

  it('refuse de répondre ok quand la base ne répond pas', async () => {
    const controller = new HealthController({ isDatabaseReachable: () => Promise.resolve(false) });

    await expect(controller.check()).rejects.toBeInstanceOf(ProblemException);
  });

  it('ne dit rien de la base dans le message renvoyé', async () => {
    const controller = new HealthController({ isDatabaseReachable: () => Promise.resolve(false) });

    // Le mot « base » ne doit pas sortir : l'état de l'infrastructure reste
    // dans les journaux.
    await expect(controller.check()).rejects.toThrow(/momentanément indisponible/);
  });
});
