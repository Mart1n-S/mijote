<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { MAIN_CONTENT_ID } from '../../navigation';

const router = useRouter();

/*
  La navigation se déduit des routes qui déclarent un libellé de navigation,
  au lieu d'une seconde liste à tenir en parallèle. Une page qui n'existe que
  en développement disparaît donc d'elle-même de la barre en production.
*/
const links = computed(() =>
  router
    .getRoutes()
    .flatMap((route) =>
      route.meta.navLabel === undefined || route.name === undefined
        ? []
        : [{ name: route.name, label: route.meta.navLabel }],
    ),
);
</script>

<template>
  <!-- Premier élément focusable du document, comme l'exige le RGAA. -->
  <a class="skip-link" :href="`#${MAIN_CONTENT_ID}`">Aller au contenu</a>

  <div class="layout">
    <header class="layout__header">
      <p class="layout__brand">Mijote</p>
    </header>

    <!--
      Un seul élément nav dans le DOM : c'est le CSS qui en fait une barre
      basse sous 640 px et une colonne latérale au-delà. Deux nav, un par
      largeur, dupliqueraient le repère de navigation et l'ordre de tabulation.
    -->
    <nav class="layout__nav" aria-label="Navigation principale">
      <ul class="list-reset layout__nav-list">
        <li v-for="link in links" :key="String(link.name)">
          <RouterLink class="layout__nav-link" :to="{ name: link.name }">
            {{ link.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>

    <main :id="MAIN_CONTENT_ID" class="layout__main" tabindex="-1">
      <slot />
    </main>

    <footer class="layout__footer">
      <p>Lot 1 : socle. Aucune fonctionnalité métier.</p>
    </footer>
  </div>
</template>

<style scoped>
/*
  Le lien d'évitement est hors de l'écran tant qu'il n'a pas le focus. Il est
  déplacé par transform et non retiré par display: none, qui le sortirait de
  l'ordre de tabulation et le rendrait inatteignable.
*/
.skip-link {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: var(--layer-skip-link);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-background);
  border: 2px solid var(--color-focus);
  border-radius: var(--radius-md);
  text-decoration: none;
  transform: translateY(-250%);
}

.skip-link:focus {
  transform: none;
}

.layout {
  display: grid;
  grid-template-areas:
    'header'
    'main'
    'footer';
  grid-template-rows: auto 1fr auto;
  /* minmax(0, 1fr) et non 1fr : une colonne de grille vaut min-content par
     défaut, donc elle s'élargit à son contenu le plus large et étire toute la
     page. Un tableau large ferait alors défiler l'écran entier au lieu de
     défiler lui-même. */
  grid-template-columns: minmax(0, 1fr);
  /* dvh et non vh : sur mobile, vh compte la barre d'adresse et laisse le pied
     de page sous le bord de l'écran. */
  min-height: 100dvh;
  /* La barre de navigation est fixe, donc hors du flux : sans cette réserve,
     elle recouvrirait la fin du contenu et le pied de page. Sa hauteur vient
     de --nav-bar-height, qui dit ce qu'elle compte. Attention : ce calcul
     suppose une barre sur une seule ligne, voir les limites connues de
     docs/design-system.md. */
  padding-bottom: calc(var(--nav-bar-height) + env(safe-area-inset-bottom, 0px));
}

.layout__header {
  grid-area: header;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.layout__brand {
  font-size: var(--text-lg);
  font-weight: var(--weight-display);
}

.layout__main {
  grid-area: main;
  padding: var(--space-5) var(--space-4);
}

.layout__footer {
  grid-area: footer;
  padding: var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

/*
  Sous 640 px : barre fixe en bas de l'écran. Elle reste au-dessus du contenu
  qui défile, donc c'est une surface surélevée : fond raised et deuxième
  niveau d'ombre. En sombre, c'est la surface plus claire qui fait le travail,
  l'ombre noire ne se voyant pas (voir tokens.css).
*/
.layout__nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: var(--layer-nav);
  background-color: var(--color-raised);
  border-top: var(--nav-border-width) solid var(--color-border);
  box-shadow: var(--shadow-2);
  /*
    Au texte agrandi, les libellés finissent par ne plus tenir. C'est la barre
    qui défile alors, et pas la page : sa hauteur reste celle d'une ligne, donc
    la réserve de place calculée plus haut reste exacte à toute taille de
    texte, et aucun libellé n'est tronqué.
  */
  overflow-x: auto;
  /* Ce conteneur de défilement rogne ce qui dépasse de lui, anneau de focus
     compris : il lui faut donc la marge que l'anneau demande, sur les quatre
     côtés. Sans elle, l'anneau des entrées est coupé, ce qu'il était jusqu'au
     31 octobre 2026. Cette marge compte dans --nav-bar-height. */
  padding: var(--space-1);
  /* Encoche et barre de gestes des téléphones : la barre garde sa hauteur
     utile et pousse son fond jusqu'au bord bas de l'écran. */
  padding-bottom: calc(var(--space-1) + env(safe-area-inset-bottom, 0px));
}

.layout__nav-list {
  display: flex;
}

.layout__nav-link {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Zone tactile de 44 px minimum, RGAA. La barre ne porte aucun espacement
     vertical propre : sa hauteur est donc celle-ci plus son liseré, ce que la
     réserve de place du conteneur recalcule à l'identique. */
  min-height: var(--tap-min);
  min-width: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text);
  /* Plus petit que le texte courant : quatre entrées doivent tenir sur une
     seule ligne à 320 px, et le gras de la page courante ne doit pas déborder
     de sa colonne. */
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-tight);
  text-align: center;
  /* Sur une seule ligne : c'est ce qui rend la hauteur de la barre prévisible,
     et donc la réserve de place exacte. */
  white-space: nowrap;
  text-decoration: none;
  transition: background-color var(--duration-fast) ease;
}

.layout__nav-link:hover {
  background-color: var(--color-surface-hover);
}

.layout__nav-link:active {
  background-color: var(--color-surface-active);
}

/*
  La page courante se signale par trois choses, dont deux ne sont pas des
  couleurs : un trait épais sur le bord de la barre, une graisse plus forte, et
  seulement en troisième la couleur d'accent. Un écran monochrome ou un
  daltonisme laisse les deux premières lisibles.

  aria-current vient de RouterLink : la règle suit donc l'état réel annoncé au
  lecteur d'écran, et non une classe tenue à la main.
*/
.layout__nav-link[aria-current='page'] {
  box-shadow: inset 0 3px 0 0 var(--color-accent);
  color: var(--color-accent);
  font-weight: var(--weight-display);
}

@media (min-width: 40rem) {
  .layout {
    grid-template-areas:
      'header header'
      'nav main'
      'nav footer';
    grid-template-columns: minmax(9rem, auto) minmax(0, 1fr);
    /* La barre est revenue dans le flux : plus rien à réserver. */
    padding-bottom: 0;
  }

  /*
    Au-delà de 640 px : colonne latérale, dans le flux cette fois. Elle n'est
    plus au-dessus de rien, donc elle perd son ombre, reprend le fond de
    surface et n'a plus à défiler.
  */
  .layout__nav {
    position: static;
    grid-area: nav;
    overflow-x: visible;
    background-color: var(--color-surface);
    border-top: 0;
    border-right: 1px solid var(--color-border);
    box-shadow: none;
    /* Plus rien à rogner ici : la colonne n'est plus un conteneur de
       défilement, l'anneau de focus peut déborder sur la page. */
    padding: 0;
  }

  .layout__nav-list {
    flex-direction: column;
    padding: var(--space-3) var(--space-2);
    gap: var(--space-1);
  }

  .layout__nav-link {
    justify-content: flex-start;
    border-radius: var(--radius-md);
    text-align: left;
  }

  .layout__nav-link[aria-current='page'] {
    box-shadow: inset 3px 0 0 0 var(--color-accent);
  }
}
</style>
