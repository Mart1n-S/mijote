import { Controller, Get } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    // Vérification de vie seulement : la sonde de base de données viendra avec
    // la story journalisation et santé du lot 1.
    return { status: 'ok' };
  }
}
