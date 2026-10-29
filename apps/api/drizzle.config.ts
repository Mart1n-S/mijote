import { defineConfig } from 'drizzle-kit';

// Ce fichier est empaqueté par drizzle-kit avant d'être exécuté, donc
// import.meta.dirname n'y désigne pas apps/api : il ne peut pas réutiliser
// src/env.ts. drizzle-kit étant toujours lancé par les scripts du paquet, le
// répertoire courant est apps/api et le .env de la racine est deux crans
// au-dessus. Son absence n'est pas une erreur : en CI et en conteneur les
// variables viennent de l'environnement.
try {
  process.loadEnvFile('../../.env');
} catch {
  // Pas de fichier .env.
}

const url = process.env['DATABASE_URL'];

if (url === undefined || url === '') {
  throw new Error("Variable d'environnement manquante : DATABASE_URL. Voir .env.example.");
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
