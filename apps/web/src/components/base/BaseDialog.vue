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
.dialog__overlay {
  position: fixed;
  inset: 0;
  background-color: var(--color-overlay);
}

.dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: min(32rem, calc(100vw - 2 * var(--space-4)));
  /* Au zoom à 200 %, le contenu du dialogue défile dans le dialogue plutôt
     que de sortir de l'écran. */
  max-height: calc(100vh - 2 * var(--space-4));
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
