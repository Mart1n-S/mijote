<script setup lang="ts">
/*
  La consigne d'un champ. Interne aux champs de base : les cinq la rendent de la
  même façon, et c'est ici qu'elle est écrite une fois.

  Son identifiant vient de l'appelant, qui est le seul à savoir ce que son
  aria-describedby liste.
*/
defineProps<{ id: string; text: string }>();
</script>

<template>
  <p :id="id" class="help">{{ text }}</p>
</template>

<style scoped>
.help {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
