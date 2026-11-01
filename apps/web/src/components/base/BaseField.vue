<script setup lang="ts">
import { computed, useId } from 'vue';

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

// Un identifiant stable par instance, et unique même si deux champs portent le
// même label : sans lui, label et aide pointeraient sur le mauvais champ.
const uid = useId();
const inputId = `${uid}-input`;
const helpId = `${uid}-help`;
const errorId = `${uid}-error`;

/*
  Une chaîne vide n'est pas une erreur : une validation qui rend « rien à
  signaler » sous cette forme ne doit pas rendre le champ invalide. Sans ce
  calcul unique, l'attribut aria-invalid et l'affichage du message pouvaient
  se contredire, et le champ s'annonçait invalide sans dire pourquoi.

  Tout ce qui dépend de l'état du champ passe donc par ces deux valeurs, et
  jamais par une relecture directe des propriétés.
*/
const hasHelp = computed(() => (props.help ?? '') !== '');
const hasError = computed(() => (props.error ?? '') !== '');

/*
  L'aide et l'erreur sont reliées au champ dans cet ordre : le lecteur d'écran
  restitue d'abord la consigne, puis ce qui cloche. Un identifiant n'est listé
  que si l'élément correspondant est rendu, sinon la référence est cassée.
*/
const describedBy = computed<string | undefined>(() => {
  const ids = [hasHelp.value ? helpId : undefined, hasError.value ? errorId : undefined].filter(
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

    <p v-if="hasHelp" :id="helpId" class="field__help">{{ help }}</p>

    <!-- $attrs en premier, et l'ordre compte : ce qui vient après gagne. Un
         appelant qui passerait son propre aria-describedby ou aria-invalid ne
         doit pas casser le lien vers l'aide et vers l'erreur, que le composant
         seul sait tenir. -->
    <input
      v-bind="$attrs"
      :id="inputId"
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

    <!-- L'erreur ne se signale jamais par la seule couleur : elle porte un
         préfixe textuel et un repère visuel. Son annonce à l'envoi du
         formulaire est le rôle du résumé en tête, un BaseAlert. -->
    <p v-if="hasError" :id="errorId" class="field__error">
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
  font-weight: var(--weight-semibold);
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
