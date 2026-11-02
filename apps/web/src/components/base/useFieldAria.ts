import { computed, useId, type ComputedRef } from 'vue';

/*
  Les identifiants d'un champ et son `aria-describedby`, en un seul endroit.

  Les cinq champs de base posent le même problème : relier un label à son
  contrôle, et lui relier une aide et une erreur sans jamais pointer vers un
  élément qui n'est pas rendu. Écrit cinq fois, ce raisonnement finirait par
  diverger quelque part, et c'est précisément le genre de divergence qu'on ne
  voit pas à la relecture.
*/

/** Ce que cette fonction lit des propriétés d'un champ. */
export interface FieldDescription {
  /** Consigne de saisie, lue avant que l'utilisateur ne réponde. */
  help?: string | undefined;
  /** Message d'erreur. Un message non vide rend le champ invalide. */
  error?: string | undefined;
}

export interface FieldAria {
  /** Identifiant du contrôle, pour le `for` de son label. */
  controlId: string;
  helpId: string;
  errorId: string;
  hasHelp: ComputedRef<boolean>;
  hasError: ComputedRef<boolean>;
  describedBy: ComputedRef<string | undefined>;
}

/**
 * Les identifiants et les liens ARIA d'un champ.
 *
 * À appeler avec l'objet de propriétés lui-même, et non avec des propriétés
 * déstructurées : les deux booléens et `describedBy` suivent alors les
 * changements d'aide et d'erreur.
 */
export function useFieldAria(props: FieldDescription): FieldAria {
  // Un identifiant stable par instance, et unique même si deux champs portent
  // le même label : sans lui, label et aide pointeraient sur le mauvais champ.
  const uid = useId();

  /*
    Une chaîne vide n'est pas une erreur : une validation qui rend « rien à
    signaler » sous cette forme ne doit pas rendre le champ invalide, sans quoi
    il s'annonce invalide sans dire pourquoi. Tout ce qui dépend de l'état passe
    par ces deux calculs, et jamais par une relecture directe des propriétés.
  */
  const hasHelp = computed(() => (props.help ?? '') !== '');
  const hasError = computed(() => (props.error ?? '') !== '');

  const helpId = `${uid}-help`;
  const errorId = `${uid}-error`;

  /*
    L'aide et l'erreur sont reliées dans cet ordre : le lecteur d'écran
    restitue d'abord la consigne, puis ce qui cloche. Un identifiant n'est listé
    que si l'élément correspondant est rendu, sinon la référence est cassée.
  */
  const describedBy = computed<string | undefined>(() => {
    const ids = [hasHelp.value ? helpId : undefined, hasError.value ? errorId : undefined].filter(
      (id): id is string => id !== undefined,
    );

    return ids.length > 0 ? ids.join(' ') : undefined;
  });

  return { controlId: `${uid}-control`, helpId, errorId, hasHelp, hasError, describedBy };
}
