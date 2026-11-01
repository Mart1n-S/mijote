import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';

import { createDatabase, type Database } from './client.js';

/** Jeton d'injection du client de base de données. */
export const DATABASE = 'DATABASE';

function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];

  if (url === undefined || url.trim() === '') {
    throw new Error("DATABASE_URL est absente de l'environnement. Voir .env.example.");
  }

  return url;
}

/**
 * Ouvre le pool PostgreSQL au démarrage et le referme à l'arrêt.
 *
 * C'est ce que `app.enableShutdownHooks()` attendait : sans cette fermeture, un
 * arrêt laissait les connexions ouvertes jusqu'à ce que PostgreSQL les expire.
 */
@Module({
  providers: [
    { provide: DATABASE, useFactory: (): Database => createDatabase(requireDatabaseUrl()) },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.$client.end();
  }
}
