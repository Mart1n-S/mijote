<script setup lang="ts">
import ChoiceControl from './ChoiceControl.vue';
import FieldError from './FieldError.vue';
import FieldHelp from './FieldHelp.vue';
import { useFieldAria } from './useFieldAria';

const props = withDefaults(
  defineProps<{
    label: string;
    /** Consigne, lue avant que l'utilisateur ne réponde. */
    help?: string;
    /** Message d'erreur. Un message non vide rend le champ invalide. */
    error?: string;
    required?: boolean;
    /** Indisponible : la case sort de l'ordre de tabulation. */
    disabled?: boolean;
  }>(),
  { help: undefined, error: undefined, required: false, disabled: false },
);

const checked = defineModel<boolean>({ default: false });

const { controlId, helpId, errorId, hasHelp, hasError, describedBy } = useFieldAria(props);
</script>

<template>
  <div class="checkbox">
    <div class="checkbox__row">
      <ChoiceControl
        :id="controlId"
        type="checkbox"
        :checked="checked"
        :required="required"
        :disabled="disabled"
        :invalid="hasError"
        :described-by="describedBy"
        @change="checked = $event"
      />

      <label
        class="checkbox__label"
        :class="{ 'checkbox__label--disabled': disabled }"
        :for="controlId"
      >
        {{ label }}
        <span v-if="required" class="checkbox__required">(obligatoire)</span>
      </label>
    </div>

    <!--
      L'aide vient sous la rangée, et non entre le label et le contrôle comme
      sur BaseField : ici le label est à côté de la case, et glisser la consigne
      entre les deux séparerait la case de son étiquette.
    -->
    <FieldHelp v-if="hasHelp" :id="helpId" :text="help ?? ''" />
    <FieldError v-if="hasError" :id="errorId" :text="error ?? ''" />
  </div>
</template>

<style scoped>
.checkbox {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.checkbox__row {
  display: flex;
  align-items: center;
  /* Rien entre la case et son étiquette : la zone cliquable de 44 px déborde
     déjà largement de la marque dessinée, et un écart les éloignerait. */
  gap: var(--space-1);
}

/*
  Le label remplit la hauteur de la zone cliquable et devient cliquable avec
  elle : c'est un confort en plus des 44 px du contrôle, jamais un remplacement.
*/
.checkbox__label {
  display: flex;
  align-items: center;
  min-height: var(--tap-min);
  /*
    Deux réglages pour la même raison, mesurée au texte doublé à 320 px, où
    l'étiquette débordait de 28 px et faisait défiler la page entière.

    min-width: 0 autorise l'étiquette, élément de flex, à rétrécir sous sa
    largeur minimale de contenu. Et `anywhere` plutôt que `break-word` parce que
    seul le premier entre dans le calcul de cette largeur minimale : avec
    `break-word`, le mot le plus long la fixait encore, et il reste des mots
    plus larges que la place disponible à cette taille de texte.
  */
  min-width: 0;
  overflow-wrap: anywhere;
  cursor: pointer;
}

.checkbox__label--disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.checkbox__required {
  margin-left: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
