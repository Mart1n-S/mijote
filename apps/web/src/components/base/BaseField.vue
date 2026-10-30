<script setup lang="ts">
import { computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    label: string;
    type?: 'text' | 'email' | 'password' | 'search' | 'tel' | 'number';
    /** Consigne de saisie, lue avant que l'utilisateur ne tape. */
    help?: string;
    /** Message d'erreur. Sa présence rend le champ invalide. */
    error?: string;
    required?: boolean;
    autocomplete?: string;
  }>(),
  {
    type: 'text',
    help: undefined,
    error: undefined,
    required: false,
    autocomplete: undefined,
  },
);

const value = defineModel<string>({ default: '' });

// Un identifiant stable par instance, et unique même si deux champs portent le
// même label : sans lui, label et aide pointeraient sur le mauvais champ.
const uid = useId();
const inputId = `${uid}-input`;
const helpId = `${uid}-help`;
const errorId = `${uid}-error`;

/*
  L'aide et l'erreur sont reliées au champ dans cet ordre : le lecteur d'écran
  restitue d'abord la consigne, puis ce qui cloche. Un identifiant n'est listé
  que si l'élément correspondant existe, sinon la référence est cassée.
*/
const describedBy = computed<string | undefined>(() => {
  const ids = [props.help ? helpId : undefined, props.error ? errorId : undefined].filter(
    (id): id is string => id !== undefined,
  );

  return ids.length > 0 ? ids.join(' ') : undefined;
});
</script>

<template>
  <div class="field">
    <label class="field__label" :for="inputId">
      {{ label }}
      <span v-if="required" class="field__required">(obligatoire)</span>
    </label>

    <p v-if="help" :id="helpId" class="field__help">{{ help }}</p>

    <input
      :id="inputId"
      v-model="value"
      class="field__input"
      :class="{ 'field__input--invalid': error !== undefined }"
      :type="type"
      :required="required"
      :autocomplete="autocomplete"
      :aria-describedby="describedBy"
      :aria-invalid="error !== undefined ? 'true' : undefined"
    />

    <!-- L'erreur ne se signale jamais par la seule couleur : elle porte un
         préfixe textuel et un repère visuel. Son annonce à l'envoi du
         formulaire est le rôle du résumé en tête, un BaseAlert. -->
    <p v-if="error" :id="errorId" class="field__error">
      <span class="field__error-mark" aria-hidden="true">!</span>
      <span>Erreur : {{ error }}</span>
    </p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field__label {
  font-weight: var(--weight-medium);
}

.field__required {
  color: var(--color-text-muted);
  font-weight: var(--weight-normal);
  font-size: var(--text-sm);
}

.field__help {
  color: var(--color-text-muted);
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
}

.field__input--invalid {
  /* Deux bordures d'épaisseur différente : l'état se voit aussi sans la
     couleur, pour un daltonisme ou un écran monochrome. */
  border-width: 2px;
  border-color: var(--color-danger);
}

.field__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.field__error-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  background-color: var(--color-danger);
  border-radius: var(--radius-full);
  color: var(--color-on-danger);
  font-weight: var(--weight-bold);
}
</style>
