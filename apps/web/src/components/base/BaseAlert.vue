<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const props = withDefaults(
  defineProps<{
    variant?: AlertVariant;
    /**
     * Le message à annoncer. Vide ou absent, la région reste présente mais
     * muette : c'est ce qui permet au message suivant d'être annoncé.
     */
    message?: string;
  }>(),
  { variant: 'info', message: undefined },
);

/*
  Une région aria-live n'annonce que les changements survenus après son
  arrivée dans le DOM. Une région ajoutée en même temps que son contenu est
  lue comme du texte déjà là, donc passée sous silence.

  D'où la forme de ce composant : la région est rendue inconditionnellement et
  seul son contenu est conditionnel. Il doit donc être monté avant le premier
  message, pas au moment où le message arrive.
*/

/*
  Reposer le même message ne change pas le DOM, et une région aria-live
  n'annonce que ce qui change : deux tentatives de connexion rejetées par le
  même « Identifiants incorrects » ne diraient rien la seconde fois. Réannoncer
  demande donc deux changements de contenu, en vidant la région puis en y
  reposant le texte.

  D'où cette copie du message : c'est elle qui est rendue, et c'est ce qui
  permet de vider la région sans toucher à ce que l'appelant a passé.
*/
const shown = ref(props.message ?? '');

/*
  Le délai entre les deux changements, et non un simple nextTick : les deux
  mutations tomberaient dans la même image et plusieurs lecteurs d'écran n'en
  verraient qu'une. 50 ms est la valeur usuelle de cette technique. Aucun test
  ne dit ce qui est réellement annoncé, voir docs/design-system.md.
*/
const REPLAY_DELAY_MS = 50;

let replayTimer: ReturnType<typeof setTimeout> | undefined;

function cancelReplay(): void {
  if (replayTimer !== undefined) {
    clearTimeout(replayTimer);
    replayTimer = undefined;
  }
}

/** Vide la région, puis y repose le message en cours. */
function replay(): void {
  // Un second appel repart de zéro : deux cycles entremêlés reposeraient le
  // texte au milieu du suivant, qui n'annoncerait alors plus rien.
  cancelReplay();
  shown.value = '';

  replayTimer = setTimeout(() => {
    replayTimer = undefined;
    shown.value = props.message ?? '';
  }, REPLAY_DELAY_MS);
}

/*
  Un message différent change déjà le DOM : il s'annonce sans qu'on force rien.

  Rien à annuler ici : le minuteur d'une réannonce en cours repose toujours le
  message courant, donc après ce changement il reposerait la valeur déjà
  affichée. Une annulation serait du code que rien ne peut mettre en défaut.
*/
watch(
  () => props.message,
  (message) => {
    shown.value = message ?? '';
  },
);

// Sans cela, le minuteur survit au composant : il écrit dans l'état d'une
// instance démontée, et en test il déborde sur le cas suivant.
onBeforeUnmount(cancelReplay);

/**
 * Réannonce le message en cours, identique ou non au précédent. C'est le
 * composant qui porte ce travail : l'appelant n'a pas à numéroter son message
 * pour forcer un changement.
 */
defineExpose({ reannounce: replay });

/** Avertissement et erreur interrompent la lecture en cours, le reste attend. */
const urgent = computed(() => props.variant === 'warning' || props.variant === 'error');

/** L'état est nommé en clair : il ne tient jamais à la seule couleur. */
const PREFIXES: Record<AlertVariant, string> = {
  info: 'Information',
  success: 'Succès',
  warning: 'Attention',
  error: 'Erreur',
};

const MARKS: Record<AlertVariant, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '!',
};
</script>

<template>
  <div :role="urgent ? 'alert' : 'status'" :aria-live="urgent ? 'assertive' : 'polite'">
    <div v-if="shown" class="alert" :class="`alert--${variant}`">
      <span class="alert__mark" aria-hidden="true">{{ MARKS[variant] }}</span>

      <p class="alert__text">
        <strong>{{ PREFIXES[variant] }} :</strong> {{ shown }}
      </p>
    </div>
  </div>
</template>

<style scoped>
/*
  La région n'a volontairement aucun style. display: contents la sortirait du
  box model, mais plusieurs moteurs l'ont aussi, à un moment, sortie de l'arbre
  d'accessibilité : hors de question sur une région aria-live. Vide, ce div est
  donc simplement de hauteur nulle ; dans un conteneur flex avec gap, il compte
  en revanche comme un élément. Voir docs/design-system.md.
*/

.alert {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-surface);
  /* Le liseré épais porte la couleur d'état ; le texte garde la couleur de
     texte courante, qui tient 4,5:1 sur la surface quel que soit l'état. */
  border-left: 4px solid var(--color-border-strong);
  border-radius: var(--radius-md);
}

.alert__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid currentcolor;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  line-height: 1;
}

.alert__text {
  margin: 0;
}

.alert--info {
  border-left-color: var(--color-accent);
}

.alert--info .alert__mark {
  color: var(--color-accent);
}

.alert--success {
  border-left-color: var(--color-success);
}

.alert--success .alert__mark {
  color: var(--color-success);
}

.alert--warning {
  border-left-color: var(--color-warning);
}

.alert--warning .alert__mark {
  color: var(--color-warning);
}

.alert--error {
  border-left-color: var(--color-danger);
}

.alert--error .alert__mark {
  color: var(--color-danger);
}
</style>
