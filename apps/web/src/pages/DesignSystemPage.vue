<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';

import type { AlertVariant } from '../components/base/BaseAlert.vue';
import BaseAlert from '../components/base/BaseAlert.vue';
import type { ButtonVariant } from '../components/base/BaseButton.vue';
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
  'surface-active',
  'raised',
  'border',
  'border-strong',
  'text',
  'text-muted',
  'accent',
  'accent-hover',
  'accent-active',
  'on-accent',
  'success',
  'warning',
  'danger',
  'danger-hover',
  'danger-active',
  'on-danger',
  'focus',
] as const;

const TEXT_TOKENS = ['sm', 'base', 'lg', 'xl', '2xl', 'display'] as const;
const SPACE_TOKENS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const RADIUS_TOKENS = ['sm', 'md', 'lg', 'full'] as const;
const SHADOW_TOKENS = [
  { level: 1, usage: 'une carte posée sur la page' },
  { level: 2, usage: 'la barre de navigation, au-dessus du contenu qui défile' },
  { level: 3, usage: 'le dialogue, qui sort du plan de la page' },
] as const;

const BUTTON_VARIANTS: ReadonlyArray<{ variant: ButtonVariant; label: string }> = [
  { variant: 'primary', label: 'Principal' },
  { variant: 'secondary', label: 'Secondaire' },
  { variant: 'danger', label: 'Danger' },
];

const ALERT_VARIANTS: ReadonlyArray<{ variant: AlertVariant; message: string }> = [
  { variant: 'info', message: 'La liste de courses est à jour.' },
  { variant: 'success', message: 'Le planning de la semaine est enregistré.' },
  { variant: 'warning', message: 'Deux recettes utilisent le même produit frais.' },
  { variant: 'error', message: "Le prix du produit n'a pas pu être récupéré." },
];

const search = ref('');
const email = ref('');
const quantity = ref('');
const locked = ref('250');

// Le message part vide pour montrer ce que garantit BaseAlert : la région
// aria-live est déjà dans le DOM, donc le premier message est bien annoncé.
// Un message propre à cette démonstration : celui de la variante info est
// affiché juste au-dessus, et la même phrase deux fois ne dit pas qu'elle
// démontre deux choses différentes.
const ANNOUNCED_MESSAGE = 'Les prix ont été recalculés.';
const announced = ref('');
const announcer = useTemplateRef<InstanceType<typeof BaseAlert>>('announcer');

function announce(): void {
  if (announced.value === ANNOUNCED_MESSAGE) {
    // Le même message : le DOM ne changerait pas, donc rien ne serait annoncé.
    // C'est le composant qui porte la réannonce, l'appelant n'a rien à
    // numéroter.
    announcer.value?.reannounce();

    return;
  }

  announced.value = ANNOUNCED_MESSAGE;
}

const dialogOpen = ref(false);
const loading = ref(false);

function toggleLoading(): void {
  loading.value = !loading.value;
}

/*
  Survol, enfoncement et focus ne se voient qu'en interagissant, un état à la
  fois. Ce réglage les fige côte à côte pour qu'on puisse les comparer et les
  contrôler. Les règles correspondantes sont en bas de ce fichier : elles
  recopient celles des composants, et c'est la seule duplication acceptée ici.
  Ce qui la garde, et ce qui lui échappe, est dit juste avant ces règles.

  Au repos, et non figé : c'est sur cette page que se font les vérifications au
  clavier, et trois boutons et un champ portant en permanence un anneau
  identique au vrai ne laissent plus distinguer le focus réel des états
  simulés.
*/
const frozen = ref(false);
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

    <h3>Élévation</h3>

    <p class="note">
      Une ombre ne sert qu'à dire qu'une surface est au-dessus d'une autre, jamais à décorer. En
      mode sombre, l'élévation passe surtout par une surface plus claire, parce qu'une ombre noire
      sur un fond sombre ne se voit pas.
    </p>

    <ul class="list-reset elevations">
      <li v-for="shadow in SHADOW_TOKENS" :key="shadow.level">
        <span class="elevation" :style="{ boxShadow: `var(--shadow-${shadow.level})` }">
          <code>--shadow-{{ shadow.level }}</code>
        </span>
        <span class="note">{{ shadow.usage }}</span>
      </li>
    </ul>
  </section>

  <section aria-labelledby="states-title">
    <h2 id="states-title">États</h2>

    <p>
      Chaque contrôle doit dire dans quel état il est, et jamais par la seule couleur. Survol,
      enfoncement et focus ne s'observent qu'un à la fois : la case ci-dessous les fige côte à côte
      pour les comparer.
    </p>

    <p class="freeze">
      <label>
        <input v-model="frozen" type="checkbox" />
        Figer le survol, l'enfoncement et le focus
      </label>
    </p>

    <h3>Bouton</h3>

    <!--
      Un tableau de cinq colonnes ne tient pas dans 320 px. Plutôt que de faire
      défiler la page entière, ce que le RGAA interdit, on rend le tableau seul
      défilable. La région est focusable, sinon elle serait inatteignable au
      clavier, et nommée, sinon ce focus serait muet.
    -->
    <div
      class="scroller"
      role="region"
      aria-label="Tableau des états du bouton, défilable horizontalement"
      tabindex="0"
    >
      <table class="states">
        <caption>
          Les sept états du bouton, par variante
        </caption>
        <thead>
          <tr>
            <th scope="col">État</th>
            <th v-for="button in BUTTON_VARIANTS" :key="button.variant" scope="col">
              {{ button.label }}
            </th>
            <th scope="col">Ce qui le porte, hors couleur</th>
          </tr>
        </thead>
        <tbody :class="{ 'is-frozen': frozen }">
          <tr>
            <th scope="row">Repos</th>
            <td v-for="button in BUTTON_VARIANTS" :key="button.variant">
              <BaseButton :variant="button.variant">Enregistrer</BaseButton>
            </td>
            <td class="note">Sans objet</td>
          </tr>
          <tr class="row-hover">
            <th scope="row">Survol</th>
            <td v-for="button in BUTTON_VARIANTS" :key="button.variant">
              <BaseButton :variant="button.variant">Enregistrer</BaseButton>
            </td>
            <td class="note">Le pointeur, qui est déjà dessus</td>
          </tr>
          <tr class="row-active">
            <th scope="row">Actif, enfoncé</th>
            <td v-for="button in BUTTON_VARIANTS" :key="button.variant">
              <BaseButton :variant="button.variant">Enregistrer</BaseButton>
            </td>
            <td class="note">Le bouton descend d'un pixel, coupé sous reduced-motion</td>
          </tr>
          <tr class="row-focus">
            <th scope="row">Focus visible</th>
            <td v-for="button in BUTTON_VARIANTS" :key="button.variant">
              <BaseButton :variant="button.variant">Enregistrer</BaseButton>
            </td>
            <td class="note">Un anneau détaché de 2 px, visible sur un fond plein</td>
          </tr>
          <tr>
            <th scope="row">Désactivé</th>
            <td v-for="button in BUTTON_VARIANTS" :key="button.variant">
              <BaseButton :variant="button.variant" disabled>Enregistrer</BaseButton>
            </td>
            <td class="note">
              L'attribut <code>disabled</code>, donc hors tabulation, et le curseur interdit
            </td>
          </tr>
          <tr>
            <th scope="row">En cours</th>
            <td v-for="button in BUTTON_VARIANTS" :key="button.variant">
              <BaseButton :variant="button.variant" loading>Enregistrer</BaseButton>
            </td>
            <td class="note">
              Un témoin qui tourne, et le mot « en cours » pour le lecteur d'écran
            </td>
          </tr>
          <tr>
            <th scope="row">Invalide</th>
            <td class="note" colspan="3">Sans objet : un bouton ne porte pas de validité</td>
            <td class="note">Sans objet</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Champ de saisie</h3>

    <div class="stack" :class="{ 'is-frozen': frozen }">
      <BaseField v-model="search" label="Repos" type="search" />
      <div class="row-hover"><BaseField v-model="search" label="Survol" type="search" /></div>
      <div class="row-active"><BaseField v-model="search" label="Actif" type="search" /></div>
      <div class="row-focus">
        <BaseField v-model="search" label="Focus visible" type="search" />
      </div>
      <BaseField v-model="locked" label="Désactivé" disabled />
      <BaseField
        v-model="quantity"
        label="Invalide"
        type="number"
        help="En grammes."
        error="Indiquez un nombre supérieur à zéro."
      />
    </div>

    <p class="note">
      Le champ n'a pas d'état « en cours » : c'est le bouton qui envoie le formulaire qui le porte.
    </p>

    <h3>Lien de navigation et déclencheur du dialogue</h3>

    <p class="note">
      Le lien de navigation vit dans la barre commune, en bas de cet écran sous 640 px et sur le
      côté au-delà : ses états s'y observent directement, et la page courante s'y signale par un
      trait épais et une graisse, pas seulement par la couleur. Le déclencheur du dialogue est un
      <code>BaseButton</code> : il a exactement les états du tableau ci-dessus.
    </p>
  </section>

  <section aria-labelledby="fields-title">
    <h2 id="fields-title">Champs en situation</h2>

    <div class="stack">
      <BaseField
        v-model="email"
        label="Adresse de contact"
        type="email"
        help="Elle ne sert qu'aux invitations."
        autocomplete="email"
        required
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

    <h3>Annonce et réannonce d'un message</h3>

    <p>
      <!-- Un intitulé vrai aux deux clics : au premier, rien n'a encore été
           annoncé, donc il n'y a pas de « même » message. -->
      <BaseButton variant="secondary" @click="announce">Annoncer le message</BaseButton>
    </p>

    <BaseAlert ref="announcer" variant="success" :message="announced" />
  </section>

  <section aria-labelledby="loading-title">
    <h2 id="loading-title">Action en cours</h2>

    <p>
      <BaseButton variant="secondary" @click="toggleLoading">
        {{ loading ? "Arrêter l'action en cours" : 'Mettre Enregistrer en cours' }}
      </BaseButton>
    </p>

    <p>
      <BaseButton variant="primary" :loading="loading">Enregistrer</BaseButton>
    </p>

    <p class="note">
      Désactivé porte l'attribut <code>disabled</code> et sort de l'ordre de tabulation. En cours
      porte <code>aria-disabled</code> : le bouton garde le focus, reste annoncé, et refuse le clic.
    </p>
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
  /* min() borne la piste à la largeur disponible : sans lui, 14rem vaut
     448 px au texte agrandi à 200 % et la grille déborde de l'écran. */
  grid-template-columns: repeat(auto-fill, minmax(min(14rem, 100%), 1fr));
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

.elevations {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-4);
}

.elevations li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
}

.elevation {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  /* Même raison que la grille des couleurs, au texte agrandi. */
  width: min(12rem, 100%);
  padding: var(--space-4);
  background-color: var(--color-raised);
  border-radius: var(--radius-md);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-3);
}

.note {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

p {
  margin-top: var(--space-3);
}

.freeze {
  padding: var(--space-3);
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
}

.freeze label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
}

.scroller {
  /*
    position: relative n'est pas décoratif ici. Les boutons « en cours »
    contiennent un .visually-hidden en position absolue ; sans bloc conteneur
    positionné, il se rattache au bloc conteneur initial, échappe au défileur
    et étire la page entière. C'est ce qui faisait déborder l'écran à 320 px.
  */
  position: relative;
  margin-top: var(--space-4);
  overflow-x: auto;
}

.states {
  width: 100%;
  border-collapse: collapse;
}

.states th,
.states td {
  /* Les colonnes ne s'écrasent pas : c'est la région qui défile. */
  white-space: nowrap;
}

.states .note {
  white-space: normal;
  min-width: 14rem;
}

.states caption {
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: left;
}

.states th,
.states td {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: middle;
}

.states thead th {
  font-size: var(--text-sm);
}

/*
  Les règles ci-dessous recopient celles des composants pour figer un état
  qu'on ne peut sinon observer qu'en interagissant. C'est la seule duplication
  acceptée dans ce fichier.

  Elle n'a longtemps été gardée par rien : l'exemplaire vivant de la ligne
  « Repos » ne montre que le repos, donc il ne compare rien des états figés
  ici. Trois divergences y ont vécu jusqu'au 31 octobre 2026, dont une
  invisible en thème clair, où les deux jetons concernés ont la même valeur.

  Depuis, le bloc « copie figée des états » de e2e/design-system.spec.ts
  compare chaque état figé à ce que le composant vivant produit réellement, en
  thème sombre. Un écart sur l'une de ces règles fait donc tomber un test.

  Restent hors du verrou, à comparer à la lecture contre BaseButton.vue,
  BaseField.vue et base.css : le focus du bouton, qu'un test ne peut pas
  déclencher aussi simplement que celui d'un champ, et les règles sous
  prefers-reduced-motion.

  :deep() est nécessaire parce que la cible est à l'intérieur d'un composant
  enfant, hors de portée du style scopé.
*/
.is-frozen .row-hover :deep(.button--primary) {
  background-color: var(--color-accent-hover);
}

.is-frozen .row-hover :deep(.button--secondary) {
  background-color: var(--color-surface-hover);
}

.is-frozen .row-hover :deep(.button--danger) {
  background-color: var(--color-danger-hover);
}

.is-frozen .row-active :deep(.button--primary) {
  background-color: var(--color-accent-active);
}

.is-frozen .row-active :deep(.button--secondary) {
  background-color: var(--color-surface-active);
}

.is-frozen .row-active :deep(.button--danger) {
  background-color: var(--color-danger-active);
}

.is-frozen .row-active :deep(.button) {
  translate: 0 1px;
}

/* Aucun border-radius ici, pas plus que dans base.css : un contour suit déjà
   la forme de l'élément, rayon compris, et en imposer un changerait la forme
   du contrôle. La copie figée en posait un, donc elle montrait un anneau que
   l'application ne produit jamais. */
.is-frozen .row-focus :deep(.button),
.is-frozen .row-focus :deep(.field__input) {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.is-frozen .row-hover :deep(.field__input) {
  border-color: var(--color-border-hover);
}

/* Le contour autant que le fond : dans l'application, un champ enfoncé est
   forcément survolé au même instant, donc les deux règles de BaseField
   s'appliquent ensemble. Figer le seul fond montrait un champ enfoncé au
   contour de repos. */
.is-frozen .row-active :deep(.field__input) {
  background-color: var(--color-surface-hover);
  border-color: var(--color-border-hover);
}

@media (prefers-reduced-motion: reduce) {
  .is-frozen .row-active :deep(.button) {
    translate: none;
  }
}
</style>
