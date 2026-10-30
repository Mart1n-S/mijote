<script setup lang="ts">
export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    type?: 'button' | 'submit' | 'reset';
    /** Indisponible durablement : le bouton sort de l'ordre de tabulation. */
    disabled?: boolean;
    /** Action en cours : le bouton garde le focus et refuse les clics. */
    loading?: boolean;
    /** Ce que le lecteur d'écran ajoute au libellé pendant l'action. */
    loadingLabel?: string;
  }>(),
  {
    variant: 'primary',
    type: 'button',
    disabled: false,
    loading: false,
    loadingLabel: 'en cours',
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();

function onClick(event: MouseEvent): void {
  if (props.loading) {
    // L'état en cours passe par aria-disabled et non par l'attribut disabled,
    // pour que le bouton garde le focus et reste annoncé pendant l'action. Un
    // bouton focusable reçoit encore les clics et la touche Entrée : c'est donc
    // ici, et nulle part ailleurs, qu'ils sont refusés.
    event.preventDefault();
    event.stopPropagation();

    return;
  }

  emit('click', event);
}
</script>

<template>
  <button
    :type="type"
    class="button"
    :class="`button--${variant}`"
    :disabled="disabled"
    :aria-disabled="loading ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    @click="onClick"
  >
    <span v-if="loading" class="button__spinner" aria-hidden="true" />

    <span><slot /></span>

    <!-- L'action en cours doit s'entendre et pas seulement se voir : aria-busy
         seul n'est pas restitué par tous les lecteurs d'écran. -->
    <span v-if="loading" class="visually-hidden">, {{ loadingLabel }}</span>
  </button>
</template>

<style scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  /* Zone tactile de 44 px minimum, RGAA. */
  min-height: var(--tap-min);
  min-width: var(--tap-min);
  padding: var(--space-2) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  text-align: center;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

.button--primary {
  background-color: var(--color-accent);
  color: var(--color-on-accent);
}

.button--primary:hover:not(:disabled, [aria-disabled='true']) {
  background-color: var(--color-accent-hover);
}

.button--secondary {
  background-color: var(--color-surface);
  border-color: var(--color-border-strong);
  color: var(--color-text);
}

.button--secondary:hover:not(:disabled, [aria-disabled='true']) {
  background-color: var(--color-surface-hover);
}

.button--danger {
  background-color: var(--color-danger);
  color: var(--color-on-danger);
}

.button--danger:hover:not(:disabled, [aria-disabled='true']) {
  background-color: var(--color-danger-hover);
}

/* Un contrôle inactif est hors du champ des seuils de contraste (WCAG 1.4.3,
   « incidental »), ce qui autorise l'atténuation. L'état en cours, lui, garde
   son contraste plein : il est actif, et c'est le témoin qui le signale. */
.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button[aria-disabled='true'] {
  cursor: progress;
}

.button__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentcolor;
  /* Un seul côté transparent : le témoin reste lisible une fois figé par
     prefers-reduced-motion, où l'animation est supprimée (base.css). */
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: button-spin 700ms linear infinite;
}

@keyframes button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
