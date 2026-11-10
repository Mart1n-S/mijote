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

/**
 * Lit l'adresse publique de l'application, celle que porteront les liens.
 *
 * **Elle ne vient pas de la requête**, et c'est le point important : un en-tête
 * `Host` est écrit par le client. Construire le lien avec lui laisserait
 * quelqu'un faire partir un jeton vers son propre domaine, en demandant une
 * invitation ou une réinitialisation pour une adresse qu'il contrôle. C'est
 * l'erreur classique des e-mails de réinitialisation, et elle se paie par un
 * compte (ADR 0013, ADR 0014).
 *
 * Elle vit ici, et non dans un module : les invitations et la réinitialisation
 * la lisent toutes deux, et le module de la connexion n'a pas à dépendre de
 * celui des invitations.
 */
export function readAppBaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env['APP_BASE_URL']?.trim();

  if (raw === undefined || raw === '') {
    throw new Error("APP_BASE_URL est absente de l'environnement. Voir .env.example.");
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`APP_BASE_URL n'est pas une adresse lisible : ${raw}. Voir .env.example.`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('APP_BASE_URL doit être une adresse http ou https. Voir .env.example.');
  }

  /*
    Ni chaîne de requête ni fragment : les liens se construisent en ajoutant un
    chemin et un fragment, donc une telle valeur produirait une adresse cassée
    (`https://hôte/?x=1/invitation#...`). Cette fonction décide du domaine où
    part un jeton : autant qu'elle refuse ce qu'elle ne sait pas construire.
  */
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error(
      'APP_BASE_URL ne doit porter ni paramètre de requête ni fragment. Voir .env.example.',
    );
  }

  // Sans barre oblique finale : les liens en ajoutent une.
  return raw.replace(/\/+$/, '');
}
