import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseProbe } from '../db/client.js';

import { HealthService } from './health.service.js';

/*
  Le service est instancié directement, sans conteneur NestJS (ADR 0002). La
  sonde est une fausse base, et c'est tout ce que le service déclare attendre :
  pas besoin d'un client Drizzle entier ni d'un PostgreSQL qui tourne.

  Le journal est un vrai PinoLogger au niveau `silent` : il n'écrit rien, et on
  peut vérifier qu'il a bien été appelé.
*/
function serviceWith(probe: DatabaseProbe) {
  const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
  const warn = vi.spyOn(logger, 'warn');

  return { service: new HealthService(probe, logger), warn };
}

describe('HealthService', () => {
  it('dit que la base répond quand la requête aboutit', async () => {
    const { service } = serviceWith({ execute: () => Promise.resolve([{ '?column?': 1 }]) });

    expect(await service.isDatabaseReachable()).toBe(true);
  });

  it('dit que la base ne répond pas, et journalise la raison', async () => {
    const failure = new Error('connect ECONNREFUSED 127.0.0.1:5433');
    const { service, warn } = serviceWith({ execute: () => Promise.reject(failure) });

    expect(await service.isDatabaseReachable()).toBe(false);
    // L'erreur n'est pas avalée : elle part au journal avec son contexte.
    expect(warn).toHaveBeenCalledWith({ err: failure }, 'la base de données ne répond pas');
  });

  it('ne laisse pas échapper une erreur synchrone de la sonde', async () => {
    const { service } = serviceWith({
      execute: () => {
        throw new Error('pool fermé');
      },
    });

    expect(await service.isDatabaseReachable()).toBe(false);
  });
});
