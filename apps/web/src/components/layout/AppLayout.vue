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
  z-index: 2;
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
  /* dvh et non vh : sur mobile, vh compte la barre d'adresse et laisse le pied
     de page sous le bord de l'écran. */
  min-height: 100dvh;
  /* La barre de navigation est fixe, donc hors du flux : sans cette réserve,
     elle recouvrirait la fin du contenu et le pied de page. */
  padding-bottom: calc(var(--tap-min) + env(safe-area-inset-bottom, 0px));
}

.layout__header {
  grid-area: header;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.layout__brand {
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
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

/* Sous 640 px : barre fixe en bas de l'écran. */
.layout__nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  /* Encoche et barre de gestes des téléphones. */
  padding-bottom: env(safe-area-inset-bottom, 0);
}

.layout__nav-list {
  display: flex;
}

.layout__nav-link {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Zone tactile de 44 px minimum, RGAA. */
  min-height: var(--tap-min);
  min-width: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text);
  text-align: center;
  text-decoration: none;
}

.layout__nav-link:hover {
  background-color: var(--color-surface-hover);
}

/*
  La page courante se signale par un trait et par une graisse, pas seulement
  par une couleur. aria-current vient de RouterLink : la règle suit donc l'état
  réel annoncé au lecteur d'écran, et non une classe tenue à la main.
*/
.layout__nav-link[aria-current='page'] {
  box-shadow: inset 0 -3px 0 0 var(--color-accent);
  color: var(--color-accent);
  font-weight: var(--weight-bold);
}

@media (min-width: 40rem) {
  .layout {
    grid-template-areas:
      'header header'
      'nav main'
      'nav footer';
    grid-template-columns: minmax(9rem, auto) 1fr;
    /* La barre est revenue dans le flux : plus rien à réserver. */
    padding-bottom: 0;
  }

  /* Au-delà de 640 px : colonne latérale, dans le flux cette fois. */
  .layout__nav {
    position: static;
    grid-area: nav;
    border-top: 0;
    border-right: 1px solid var(--color-border);
    padding-bottom: 0;
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
