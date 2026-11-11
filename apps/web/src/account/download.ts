/*
  Enregistrer un fichier reçu de l'API.

  Isolé ici parce que c'est la seule manipulation de DOM du projet qui ne passe
  pas par un composant : un lien créé, activé, puis retiré.
*/

/**
 * Propose le fichier au téléchargement, sous ce nom.
 *
 * L'URL de l'objet est révoquée aussitôt : elle garde le blob en mémoire tant
 * qu'elle existe, et ce blob porte des données de santé. Le clic est déjà parti
 * quand la révocation arrive, le navigateur ayant retenu la ressource le temps
 * du téléchargement.
 */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  /*
    Le lien n'est pas ajouté au document : `click()` suffit sur les navigateurs
    visés, et un lien dans le corps apparaîtrait un instant dans l'ordre de
    tabulation et sous le lecteur d'écran.
  */
  link.click();

  URL.revokeObjectURL(url);
}
