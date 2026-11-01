import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';

import { ProblemException } from '../errors/problem.exception.js';

import { HealthService } from './health.service.js';

export interface HealthStatus {
  status: 'ok';
}

/**
 * Ce que le contrôleur attend du service, et rien de plus.
 *
 * Le jeton d'injection reste la classe `HealthService` ; seul le type déclaré
 * est réduit, pour que le contrôleur se teste avec une sonde de deux lignes.
 */
export interface HealthProbe {
  isDatabaseReachable(): Promise<boolean>;
}

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthProbe) {}

  @Get()
  async check(): Promise<HealthStatus> {
    if (!(await this.health.isDatabaseReachable())) {
      /*
        Le détail reste générique : l'état de l'infrastructure ne se raconte pas
        au navigateur. La raison précise est dans les journaux, retrouvable par
        l'identifiant de requête que porte la réponse.

        Une ProblemException et non la ServiceUnavailableException de NestJS :
        c'est la famille dont le filtre recopie le message, parce qu'il est
        écrit ici, en français, pour être lu.
      */
      throw new ProblemException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Le service est momentanément indisponible.',
      );
    }

    return { status: 'ok' };
  }
}
