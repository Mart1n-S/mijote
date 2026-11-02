<script setup lang="ts">
/*
  Le message d'erreur d'un champ. Interne aux champs de base, et écrit une seule
  fois : c'est ce qui garantit que les cinq signalent une erreur de la même
  façon, préfixe et repère compris.
*/
defineProps<{ id: string; text: string }>();
</script>

<template>
  <!--
    L'erreur ne se signale jamais par la seule couleur : elle porte un préfixe
    textuel et un repère visuel. Son annonce à l'envoi du formulaire est le rôle
    du résumé en tête, un BaseAlert : ce composant relie, il n'annonce pas.
  -->
  <p :id="id" class="error">
    <span class="error__mark" aria-hidden="true">!</span>
    <span>Erreur : {{ text }}</span>
  </p>
</template>

<style scoped>
.error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.error__mark {
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
