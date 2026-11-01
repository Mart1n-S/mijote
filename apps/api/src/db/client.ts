import type { SQL } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

// Le type est écrit à la main plutôt que déduit de createDatabase : la
// fonction porte désormais son type de retour, et le déduire d'elle-même
// serait circulaire. `$client` est ce que drizzle ajoute au-dessus de la base,
// et c'est par lui qu'on fermera le pool.
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

/**
 * Ce qu'une sonde de santé demande à la base, et rien de plus.
 *
 * Cette forme réduite vit ici, à côté du client : c'est une vue de ce qu'il
 * offre, et non un besoin propre à un module. Le jeton d'injection étant une
 * chaîne, rien ne relierait sinon `Database` à cette forme ; c'est la fabrique
 * de `DatabaseModule` qui fait vérifier le lien au compilateur.
 */
export interface DatabaseProbe {
  execute(query: SQL): Promise<unknown>;
}

/** Ouvre un pool PostgreSQL et le branche sur le schéma Drizzle. */
export function createDatabase(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    /*
      Deux délais, parce que la sonde de /health doit répondre, même mal : sans
      eux, une base qui accepte la connexion sans jamais répondre laisserait la
      requête de santé pendante, et le client attendre.
    */
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
  });

  return drizzle(pool, { schema });
}
