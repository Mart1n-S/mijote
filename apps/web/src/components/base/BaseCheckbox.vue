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
    <ChoiceControl
      :id="controlId"
      type="checkbox"
      :label="label"
      :checked="checked"
      :required="required"
      :show-required="required"
      :disabled="disabled"
      :invalid="hasError"
      :described-by="describedBy"
      @change="checked = $event"
    />

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
</style>
