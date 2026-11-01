<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from 'reka-ui';

import BaseButton from './BaseButton.vue';

/*
  Le dialogue modal est le composant le plus difficile à rendre accessible :
  piège de focus, retour du focus sur le déclencheur, fermeture par Échap,
  aria-modal, inertie de l'arrière-plan. Reka UI s'en charge (ADR 0001), et
  ce composant n'apporte que le style et la structure attendue du projet.
*/

withDefaults(
  defineProps<{
    title: string;
    /** Reliée au dialogue par aria-describedby, via Reka UI. */
    description?: string;
    closeLabel?: string;
  }>(),
  { description: undefined, closeLabel: 'Fermer' },
);

const open = defineModel<boolean>('open', { default: false });
</script>

<template>
  <DialogRoot v-model:open="open">
    <!--
      Le déclencheur est fourni par l'appelant, qui seul sait quel bouton ouvre
      le dialogue, mais c'est ici qu'il est relié à Reka UI : l'appelant passe
      un bouton du projet et n'a pas à connaître Reka UI. C'est aussi ce lien
      qui fait revenir le focus sur ce bouton à la fermeture.
    -->
    <DialogTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </DialogTrigger>

    <DialogPortal>
      <DialogOverlay class="dialog__overlay" />

      <DialogContent class="dialog">
        <DialogTitle class="dialog__title">{{ title }}</DialogTitle>

        <DialogDescription v-if="description" class="dialog__description">
          {{ description }}
        </DialogDescription>

        <slot />

        <div class="dialog__actions">
          <slot name="actions" />

          <!-- as-child pose le comportement de fermeture sur le bouton du
               projet au lieu d'un bouton à styler une seconde fois. -->
          <DialogClose as-child>
            <BaseButton variant="secondary">{{ closeLabel }}</BaseButton>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
/*
  Le voile et le dialogue passent au-dessus de la barre de navigation : sans
  z-index, ils sont à `auto`, et un z-index positif comme celui de la barre
  passe après eux dans le même contexte d'empilement. La barre restait donc en
  pleine lumière devant un écran assombri, alors que Reka UI l'avait bien
  retirée de l'arbre d'accessibilité. Les deux couches viennent de l'échelle de
  tokens.css, jamais d'un nombre écrit ici.
*/
.dialog__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--layer-overlay);
  background-color: var(--color-overlay);
}

.dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: var(--layer-dialog);
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  /*
    Pourcentage et non unité de fenêtre : pour un élément en position fixed, le
    bloc conteneur est le bloc conteneur initial, dont la largeur exclut la
    barre de défilement. Une unité de fenêtre, elle, la compte toujours, et
    aucune variante n'y change rien : les variantes dynamiques ne concernent
    que la hauteur, la seule qui varie avec l'interface du navigateur. Ne pas
    « harmoniser » cette ligne en dvw par symétrie avec celle du dessous.

    Mesuré le 1er novembre 2026 : l'écart ne se voit pas aujourd'hui, parce que
    Reka UI verrouille le défilement du corps à l'ouverture (overflow: hidden
    et padding-right compensatoire), ce qui retire la barre de défilement le
    temps du dialogue. Les deux écritures donnent alors la même largeur. Le
    pourcentage reste le bon, justement parce qu'il ne dépend pas de ce
    comportement de la bibliothèque : un dialogue non modal, ou un Reka UI qui
    cesserait de verrouiller, remettrait l'écart. Un test de source interdit
    l'unité de fenêtre ici, voir BaseDialog.spec.ts.
  */
  width: min(32rem, calc(100% - 2 * var(--space-4)));
  /* Au zoom à 200 %, le contenu du dialogue défile dans le dialogue plutôt
     que de sortir de l'écran. dvh et non vh, même arbitrage que la hauteur de
     AppLayout : sur mobile, vh compte la barre d'adresse et laisse le bas du
     dialogue sous le bord de l'écran. */
  max-height: calc(100dvh - 2 * var(--space-4));
  overflow-y: auto;
  padding: var(--space-5);
  /* Le dialogue sort du plan de la page : surface surélevée et troisième
     niveau d'ombre, le seul endroit de l'application qui l'utilise. */
  background-color: var(--color-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-3);
}

.dialog__title {
  margin: 0;
  font-size: var(--text-xl);
  line-height: var(--leading-tight);
  /* La césure du titre vient de base.css, qui la pose sur tous les titres.
     Elle a été mesurée ici d'abord : au texte doublé à 320 px, « Supprimer »
     en --text-xl ne tient pas dans les 208 px de la boîte, et le dialogue n'a
     nulle part où défiler horizontalement. */
}

.dialog__description {
  margin: 0;
  color: var(--color-text-muted);
}

.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  justify-content: flex-end;
}
</style>
