import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';

// Le contrôleur est instancié directement plutôt que par le conteneur Nest :
// Rolldown, qui transforme les fichiers pour Vitest, n'émet pas les métadonnées
// de emitDecoratorMetadata, donc l'injection de dépendances n'est pas
// disponible dans les tests. Voir l'ADR 0002.
describe('HealthController', () => {
  it('répond ok', () => {
    const controller = new HealthController();

    expect(controller.check()).toEqual({ status: 'ok' });
  });
});
