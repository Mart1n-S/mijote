<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <h1>Page introuvable</h1>

  <p>
    Cette adresse ne correspond à aucune page. Le lien est peut-être périmé, ou l'adresse a pu être
    mal recopiée.
  </p>

  <p>
    <RouterLink :to="{ name: 'home' }">Retour à l'accueil</RouterLink>
  </p>
</template>
