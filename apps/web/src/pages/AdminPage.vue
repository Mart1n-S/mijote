<script setup lang="ts">
import { RouterLink } from 'vue-router';

/*
  L'entrée de l'espace d'administration.

  Elle ne porte que les invitations : c'est tout ce que le lot 1 administre. Les
  comptes, le journal d'audit et la péremption des droits d'administration
  viendront avec l'issue #48.

  La garde de navigation a déjà vérifié le rôle, le second facteur et le
  déverrouillage de cette session : c'est pourquoi cette page n'a rien à dire du
  cas où ils manquent.
*/
</script>

<template>
  <h1>Administration</h1>

  <p class="admin__intro">
    Mijote est sur invitation : personne ne crée de compte sans un lien envoyé depuis cette page.
  </p>

  <ul class="list-reset admin__sections">
    <li>
      <RouterLink class="admin__link" :to="{ name: 'admin-invitations' }">Invitations</RouterLink>
      <p class="admin__description">Inviter quelqu'un, suivre et révoquer les invitations.</p>
    </li>
  </ul>
</template>

<style scoped>
.admin__intro {
  margin-top: var(--space-4);
  color: var(--color-text-muted);
}

.admin__sections {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-5);
  gap: var(--space-4);
}

.admin__link {
  font-size: var(--text-lg);
}

.admin__description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
</style>
