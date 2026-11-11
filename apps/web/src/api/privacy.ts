import { accountDeletionStateSchema, type DeleteAccountInput } from '@mijote/shared';

import { apiRequest } from './client';

/*
  Les deux droits du RGPD, côté navigateur.

  Aucun appel ne nomme un compte : le serveur sert celui de la session, comme
  pour le foyer (ADR 0015).
*/

/** Le nom de repli, si la réponse n'en propose pas. */
const FALLBACK_FILENAME = 'mijote-mes-donnees.json';

/**
 * Le nom de fichier que le serveur propose, dans `Content-Disposition`.
 *
 * Lu plutôt que reconstruit ici : c'est le serveur qui décide de la forme du
 * nom et de sa date, et deux endroits qui la calculent finiraient par ne plus
 * dire la même chose. L'en-tête est lisible parce que l'appel est de même
 * origine (voir api/client.ts).
 */
function filenameFrom(header: string | null): string {
  const match = /filename="([^"]+)"/.exec(header ?? '');

  return match?.[1] ?? FALLBACK_FILENAME;
}

/** Le fichier d'export, tel qu'il sera enregistré. */
export interface ExportedFile {
  blob: Blob;
  filename: string;
}

/**
 * Demande l'export, et rend le fichier reçu.
 *
 * Par le client HTTP et un blob, et non par un lien direct vers la route : un
 * lien ferait afficher du JSON brut au moindre refus, là où le client rend les
 * phrases françaises du projet (ADR 0017). Le contenu n'est pas analysé ici,
 * il n'est pas destiné à l'écran.
 *
 * Un `POST` pour une lecture, parce qu'une méthode sûre passerait hors des
 * barrières CSRF : sans cela, une page tierce pourrait faire déposer ce fichier
 * dans le dossier de téléchargements de la victime. Le client écrit le jeton et
 * le type de média pour toute méthode non sûre, donc il n'y a rien à faire de
 * plus ici.
 */
export async function fetchAccountExport(): Promise<ExportedFile> {
  const response = await apiRequest('/account/export', { method: 'POST' });

  return {
    blob: await response.blob(),
    filename: filenameFrom(response.headers.get('content-disposition')),
  };
}

/** La suppression est-elle fermée à ce compte ? */
export async function fetchDeletionBlocked(): Promise<boolean> {
  const response = await apiRequest('/account/deletion');

  return accountDeletionStateSchema.parse(await response.json()).blocked;
}

/**
 * Supprime le compte connecté, son foyer et ses traces.
 *
 * Irréversible, et le serveur l'exige trois fois : le mot de passe, le code du
 * second facteur quand il est actif, et la confirmation explicite que porte le
 * corps (ADR 0017). L'état local est remis à zéro par l'appelant, la session
 * n'existant plus.
 */
export async function deleteAccount(input: DeleteAccountInput): Promise<void> {
  await apiRequest('/account/delete', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
