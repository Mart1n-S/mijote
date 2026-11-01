import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { createDatabase, type Database, type DatabaseProbe } from './client.js';

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
    {
      provide: DATABASE,
      /*
        Le type de retour annonce les deux faces de ce qui est fourni : le
        client complet, et la forme réduite que la sonde de santé déclare
        attendre. Le jeton étant une chaîne, c'est la seule chose qui fasse
        vérifier ce lien au compilateur : si Drizzle changeait la signature de
        `execute`, la compilation échouerait ici, et non à l'exécution.
      */
      useFactory: (): Database & DatabaseProbe => createDatabase(requireDatabaseUrl()),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DatabaseModule.name);

    /*
      Sans cet écouteur, une erreur sur un client **inactif** du pool
      (PostgreSQL redémarré, réseau coupé) est relancée par l'émetteur
      d'événements et devient une exception non capturée : l'API s'arrête, alors
      que c'est exactement l'incident que la sonde de santé doit savoir
      rapporter. Voir `pg-pool`, `makeIdleListener`.
    */
    this.database.$client.on('error', (error) => {
      this.logger.error({ err: error }, 'client inactif de la base en erreur');
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.database.$client.end();
  }
}
