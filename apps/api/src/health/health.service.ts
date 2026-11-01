import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import type { DatabaseProbe } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseProbe,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  /** La base répond-elle ? La question se pose à chaque appel, sans cache. */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.database.execute(sql`select 1`);

      return true;
    } catch (error) {
      /*
        L'erreur n'est pas avalée : elle est journalisée avec son contexte, et
        c'est la seule trace du pourquoi. Le navigateur, lui, ne reçoit qu'un
        503 sans détail d'infrastructure.
      */
      this.logger.warn({ err: error }, 'la base de données ne répond pas');

      return false;
    }
  }
}
