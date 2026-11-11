/*
  Enregistrer un fichier reçu de l'API.

  Isolé ici parce que c'est la seule manipulation de DOM du projet qui ne passe
  pas par un composant : un lien créé, activé, puis retiré.
*/

/**
 * Propose le fichier au téléchargement, sous ce nom.
 *
 * L'URL de l'objet est révoquée, parce qu'elle garde le blob en mémoire tant
 * qu'elle existe et que ce blob porte des données de santé. Mais elle est
 * révoquée **dans une tâche suivante**, et non juste après le clic : sur
 * WebKit, une révocation dans la même tâche annule le téléchargement, et la PWA
 * est faite pour être installée sur un téléphone. Seul Chromium est mesuré
 * (playwright.config.ts), donc le motif prudent est le bon ici.
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

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
