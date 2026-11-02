<script setup lang="ts">
import FieldError from './FieldError.vue';
import FieldHelp from './FieldHelp.vue';
import { useFieldAria } from './useFieldAria';

const props = withDefaults(
  defineProps<{
    label: string;
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'number';
    /** Consigne de saisie, lue avant que l'utilisateur ne tape. */
    help?: string;
    /** Message d'erreur. Un message non vide rend le champ invalide. */
    error?: string;
    required?: boolean;
    /** Indisponible : le champ sort de l'ordre de tabulation. */
    disabled?: boolean;
    autocomplete?: string;
  }>(),
  {
    type: 'text',
    help: undefined,
    error: undefined,
    required: false,
    disabled: false,
    autocomplete: undefined,
  },
);

/*
  Le composant n'a qu'une racine, le div.field : sans cette ligne, tout attribut
  non déclaré atterrissait sur ce conteneur au lieu du champ. name, inputmode,
  maxlength et pattern étaient donc silencieusement inopérants, et un attribut
  ARIA se retrouvait sur un div sans rôle.
*/
defineOptions({ inheritAttrs: false });

const value = defineModel<string>({ default: '' });

/*
  Identifiants et liens ARIA : la même logique pour les cinq champs de base,
  donc elle vit dans useFieldAria et non ici. C'est elle qui garantit qu'une
  chaîne vide n'est pas une erreur, et qu'aucun aria-describedby ne pointe vers
  un élément non rendu.
*/
const { controlId, helpId, errorId, hasHelp, hasError, describedBy } = useFieldAria(props);
</script>

<template>
  <div class="field">
    <label class="field__label" :for="controlId">
      {{ label }}
      <span v-if="required" class="field__required">(obligatoire)</span>
    </label>

    <FieldHelp v-if="hasHelp" :id="helpId" :text="help ?? ''" />

    <!-- $attrs en premier, et l'ordre compte : ce qui vient après gagne. Un
         appelant qui passerait son propre aria-describedby ou aria-invalid ne
         doit pas casser le lien vers l'aide et vers l'erreur, que le composant
         seul sait tenir. -->
    <input
      v-bind="$attrs"
      :id="controlId"
      v-model="value"
      class="field__input"
      :class="{ 'field__input--invalid': hasError }"
      :type="type"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-describedby="describedBy"
      :aria-invalid="hasError ? 'true' : undefined"
    />

    <FieldError v-if="hasError" :id="errorId" :text="error ?? ''" />
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field__label {
  font-weight: var(--weight-semibold);
}

.field__required {
  color: var(--color-text-muted);
  font-weight: var(--weight-normal);
  font-size: var(--text-sm);
}

.field__input {
  /* Zone tactile de 44 px minimum, RGAA. */
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  background-color: var(--color-background);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text);
  transition:
    background-color var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

/*
  Un champ réagit au survol et à l'enfoncement comme n'importe quel contrôle :
  sans cela, rien ne distingue une zone de saisie d'un bloc de texte tant qu'on
  n'a pas cliqué.
*/
/*
  L'état invalide est exclu du survol, et pas par style : sans cela, sa
  spécificité plus forte remplaçait le contour rouge par le contour de survol
  au moment précis où l'utilisateur pointe le champ à corriger.
*/
.field__input:hover:not(:disabled, .field__input--invalid) {
  border-color: var(--color-border-hover);
}

.field__input:active:not(:disabled) {
  background-color: var(--color-surface-hover);
}

.field__input:disabled {
  background-color: var(--color-surface);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.field__input--invalid {
  /* Deux bordures d'épaisseur différente : l'état se voit aussi sans la
     couleur, pour un daltonisme ou un écran monochrome. */
  border-width: 2px;
  border-color: var(--color-danger);
}
</style>
