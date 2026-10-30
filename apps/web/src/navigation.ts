import { nextTick } from 'vue';
import type { Router } from 'vue-router';

const APP_NAME = 'Mijote';

/** Cible du lien d'évitement, et élément qui reçoit le focus à la navigation. */
export const MAIN_CONTENT_ID = 'content';

/** Le titre du document pour une page donnée. */
export function documentTitleFor(pageTitle: string | undefined): string {
  return pageTitle === undefined ? APP_NAME : `${pageTitle} - ${APP_NAME}`;
}

/**
 * Branche le retour de navigation exigé par vue-accessibility.md : à chaque
 * changement de page, le titre du document suit la page et le focus repart du
 * contenu principal.
 *
 * Sans cela, une application d'une seule page laisse le lecteur d'écran
 * annoncer l'ancien titre et le focus là où il était, le plus souvent dans la
 * navigation qu'on vient de quitter.
 */
export function installNavigationFeedback(router: Router): void {
  router.afterEach((to, from) => {
    document.title = documentTitleFor(to.meta.title);

    // Au premier affichage, le focus est déjà au début du document. Le
    // déplacer ferait sauter l'en-tête et le lien d'évitement.
    if (from.name === undefined) {
      return;
    }

    // Le composant de la nouvelle page n'est pas encore rendu quand ce crochet
    // s'exécute : sans attendre, getElementById viserait l'ancien contenu.
    void nextTick(() => {
      document.getElementById(MAIN_CONTENT_ID)?.focus();
    });
  });
}
