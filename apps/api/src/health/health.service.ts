import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { DATABASE } from '../db/database.module.js';

/**
 * Ce que la sonde demande à la base, et rien de plus.
 *
 * Le service ne dépend pas du client Drizzle entier : il n'en utilise qu'une
 * méthode, donc c'est elle qu'il déclare. Le jeton d'injection fournit bien le
 * client complet, qui satisfait cette forme.
 */
export interface DatabaseProbe {
  execute(query: SQL): Promise<unknown>;
}

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
