<script setup lang="ts">
import { ref } from 'vue';

import type { AlertVariant } from '../components/base/BaseAlert.vue';
import BaseAlert from '../components/base/BaseAlert.vue';
import BaseButton from '../components/base/BaseButton.vue';
import BaseDialog from '../components/base/BaseDialog.vue';
import BaseField from '../components/base/BaseField.vue';

/*
  Page de démonstration du design system. Elle n'est pas une page de
  l'application : elle n'existe que hors production (voir routes.ts) et sert de
  support au contrôle axe-core, en mode clair comme en mode sombre.
*/

const COLOR_TOKENS = [
  'background',
  'surface',
  'surface-hover',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'accent',
  'accent-hover',
  'on-accent',
  'success',
  'warning',
  'danger',
  'danger-hover',
  'on-danger',
  'focus',
] as const;

const TEXT_TOKENS = ['sm', 'base', 'lg', 'xl', '2xl'] as const;
const SPACE_TOKENS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const RADIUS_TOKENS = ['sm', 'md', 'full'] as const;

const ALERT_VARIANTS: ReadonlyArray<{ variant: AlertVariant; message: string }> = [
  { variant: 'info', message: 'La liste de courses est à jour.' },
  { variant: 'success', message: 'Le planning de la semaine est enregistré.' },
  { variant: 'warning', message: 'Deux recettes utilisent le même produit frais.' },
  { variant: 'error', message: "Le prix du produit n'a pas pu être récupéré." },
];

const search = ref('');
const email = ref('');
const quantity = ref('');

// Le message part vide pour montrer ce que garantit BaseAlert : la région
// aria-live est déjà dans le DOM, donc le premier message est bien annoncé.
const announced = ref('');
let announcementCount = 0;

function announce(): void {
  announcementCount += 1;
  announced.value = `Message annoncé ${announcementCount} fois depuis le chargement.`;
}

const dialogOpen = ref(false);
const loading = ref(false);

function toggleLoading(): void {
  loading.value = !loading.value;
}
</script>

<template>
  <h1>Design system</h1>

  <p class="intro">
    Les jetons et les composants de base du projet, réunis sur une page pour les comparer et pour
    servir de support au contrôle d'accessibilité automatisé. Cette page n'est pas livrée en
    production.
  </p>

  <section aria-labelledby="tokens-title">
    <h2 id="tokens-title">Jetons</h2>

    <h3>Couleurs</h3>

    <ul class="list-reset swatches">
      <li v-for="token in COLOR_TOKENS" :key="token" class="swatch">
        <span class="swatch__sample" :style="{ backgroundColor: `var(--color-${token})` }" />
        <code>--color-{{ token }}</code>
      </li>
    </ul>

    <h3>Tailles de texte</h3>

    <ul class="list-reset samples">
      <li v-for="token in TEXT_TOKENS" :key="token">
        <span :style="{ fontSize: `var(--text-${token})` }">Mijote</span>
        <code>--text-{{ token }}</code>
      </li>
    </ul>

    <h3>Espacements</h3>

    <ul class="list-reset samples">
      <li v-for="token in SPACE_TOKENS" :key="token">
        <span class="bar" :style="{ width: `var(--space-${token})` }" />
        <code>--space-{{ token }}</code>
      </li>
    </ul>

    <h3>Rayons</h3>

    <ul class="list-reset samples">
      <li v-for="token in RADIUS_TOKENS" :key="token">
        <span class="radius" :style="{ borderRadius: `var(--radius-${token})` }" />
        <code>--radius-{{ token }}</code>
      </li>
    </ul>
  </section>

  <section aria-labelledby="buttons-title">
    <h2 id="buttons-title">Boutons</h2>

    <div class="row">
      <BaseButton variant="primary">Principal</BaseButton>
      <BaseButton variant="secondary">Secondaire</BaseButton>
      <BaseButton variant="danger">Danger</BaseButton>
      <BaseButton variant="primary" disabled>Désactivé</BaseButton>
      <BaseButton variant="primary" :loading="loading">Enregistrer</BaseButton>
    </div>

    <p>
      <BaseButton variant="secondary" @click="toggleLoading">
        {{ loading ? "Arrêter l'action en cours" : 'Mettre Enregistrer en cours' }}
      </BaseButton>
    </p>

    <p class="note">
      Désactivé porte l'attribut <code>disabled</code> et sort de l'ordre de tabulation. En cours
      porte <code>aria-disabled</code> : le bouton garde le focus, reste annoncé, et refuse le clic.
    </p>
  </section>

  <section aria-labelledby="fields-title">
    <h2 id="fields-title">Champs de saisie</h2>

    <div class="stack">
      <BaseField v-model="search" label="Recherche" type="search" />

      <BaseField
        v-model="email"
        label="Adresse de contact"
        type="email"
        help="Elle ne sert qu'aux invitations."
        autocomplete="email"
        required
      />

      <BaseField
        v-model="quantity"
        label="Quantité"
        type="number"
        help="En grammes."
        error="Indiquez un nombre supérieur à zéro."
      />
    </div>
  </section>

  <section aria-labelledby="alerts-title">
    <h2 id="alerts-title">Messages</h2>

    <div class="stack">
      <BaseAlert
        v-for="alert in ALERT_VARIANTS"
        :key="alert.variant"
        :variant="alert.variant"
        :message="alert.message"
      />
    </div>

    <h3>Annonce d'un message qui arrive</h3>

    <p>
      <BaseButton variant="secondary" @click="announce">Annoncer un message</BaseButton>
    </p>

    <BaseAlert variant="success" :message="announced" />
  </section>

  <section aria-labelledby="dialog-title">
    <h2 id="dialog-title">Dialogue modal</h2>

    <BaseDialog
      v-model:open="dialogOpen"
      title="Supprimer la semaine du 3 novembre ?"
      description="Les sept repas et la liste de courses associée seront retirés du planning."
      close-label="Annuler"
    >
      <template #trigger>
        <BaseButton variant="danger">Supprimer la semaine</BaseButton>
      </template>

      <p>Cette démonstration ne supprime rien.</p>

      <template #actions>
        <BaseButton variant="danger" @click="dialogOpen = false">Supprimer</BaseButton>
      </template>
    </BaseDialog>
  </section>
</template>

<style scoped>
.intro,
section {
  max-width: 60ch;
}

section {
  margin-top: var(--space-7);
}

h3 {
  margin-top: var(--space-5);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.swatch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* L'échantillon ne porte aucun texte : c'est le nom du jeton, à côté, qui
   l'identifie. Le liseré le rend visible même quand sa couleur est celle du
   fond de la page. */
.swatch__sample {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
}

.samples {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.samples li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.bar,
.radius {
  flex: none;
  height: 1.5rem;
  background-color: var(--color-accent);
}

.radius {
  width: 3rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-3);
}

.note {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

p {
  margin-top: var(--space-3);
}
</style>
