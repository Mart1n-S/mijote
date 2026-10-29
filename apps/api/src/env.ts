import { resolve } from 'node:path';

// Le .env est à la racine du monorepo. Le chemin est calculé depuis ce fichier
// et non depuis le répertoire courant, pour valoir aussi bien depuis src
// (développement) que depuis dist (exécution) : les deux sont au même niveau
// sous apps/api.
const CHEMIN_ENV = resolve(import.meta.dirname, '../../../.env');

/**
 * Charge le .env de la racine s'il existe, par le chargeur intégré de Node 24.
 * En conteneur et en CI il n'y a pas de fichier : les variables viennent déjà
 * de l'environnement, donc son absence n'est pas une erreur.
 */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(CHEMIN_ENV);
  } catch {
    // Pas de fichier .env : on garde l'environnement tel quel.
  }
}
