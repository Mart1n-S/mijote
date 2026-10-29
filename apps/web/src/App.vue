<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <header>
    <p>Mijote</p>
  </header>

  <main>
    <RouterView />
  </main>

  <footer>
    <p>Lot 1 : socle. Aucune fonctionnalité métier.</p>
  </footer>
</template>

<!--
  Pas de style : les jetons de design et les styles maison arrivent avec la
  story du design system. Cette coquille n'est que du HTML sémantique, dont
  les repères banner, main et contentinfo que le test axe-core attend.
-->
