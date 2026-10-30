import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema.js';

// Le type est écrit à la main plutôt que déduit de createDatabase : la
// fonction porte désormais son type de retour, et le déduire d'elle-même
// serait circulaire. `$client` est ce que drizzle ajoute au-dessus de la base,
// et c'est par lui qu'on fermera le pool.
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

/** Ouvre un pool PostgreSQL et le branche sur le schéma Drizzle. */
export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString });

  return drizzle(pool, { schema });
}
