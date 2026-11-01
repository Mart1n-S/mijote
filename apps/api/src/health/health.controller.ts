import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';

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

        L'exception traverse le filtre global, donc ce 503 sort au format
        RFC 9457 comme toutes les autres erreurs.
      */
      throw new ServiceUnavailableException('Le service est momentanément indisponible.');
    }

    return { status: 'ok' };
  }
}
