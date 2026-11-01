<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { ApiError, apiRequest } from '../../api/client';
import BaseAlert from '../base/BaseAlert.vue';

/*
  Rien ne s'affiche quand l'API répond : ce bandeau n'existe que pour dire
  qu'elle ne répond pas, et c'est aussi le seul consommateur du client HTTP tant
  qu'aucun écran métier n'existe.

  La région aria-live de BaseAlert, elle, est montée dès le départ, sinon
  l'arrivée du message ne serait pas annoncée au lecteur d'écran : c'est la
  raison d'être de la forme de ce composant (voir BaseAlert).
*/
const message = ref('');

async function checkService(): Promise<void> {
  try {
    await apiRequest('/health');
  } catch (error) {
    /*
      L'erreur n'est pas avalée : elle devient le message montré. Une erreur qui
      ne serait pas une ApiError ne peut venir que d'un défaut du client
      lui-même, et le message par défaut reste vrai dans ce cas.
    */
    message.value =
      error instanceof ApiError
        ? error.userMessage
        : 'Le service est injoignable. Vérifiez votre connexion, puis réessayez.';
  }
}

/*
  Une seule vérification, au montage : ce composant vit dans AppLayout, monté
  une fois pour la session, donc changer de page ne relance pas l'appel.
*/
onMounted(() => {
  void checkService();
});
</script>

<template>
  <BaseAlert
    :class="{ 'service-status--shown': message !== '' }"
    variant="error"
    :message="message"
  />
</template>

<style scoped>
/*
  L'espace sous le bandeau n'existe que quand il y a un bandeau. La classe
  atterrit sur la racine de BaseAlert, c'est-à-dire sur la région aria-live
  elle-même, et elle n'est posée que si le message n'est pas vide : la région
  reste donc présente et sans marge le reste du temps, au lieu de décaler
  toutes les pages pour rien.
*/
.service-status--shown {
  margin-bottom: var(--space-5);
}
</style>
