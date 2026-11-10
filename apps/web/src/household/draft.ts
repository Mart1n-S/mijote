import {
  allergensSchema,
  dietsSchema,
  excludedIngredientsSchema,
  householdGoalSchema,
  MAX_EXCLUDED_INGREDIENT_LENGTH,
  MAX_HOUSEHOLD_NAME_LENGTH,
  MAX_MEAL_MINUTES,
  MAX_MONTHLY_BUDGET_CENTS,
  MAX_PEOPLE,
  MIN_MEAL_MINUTES,
  MIN_PEOPLE,
  updateHouseholdProfileSchema,
  varietyBalanceSchema,
  type FieldError,
  type HouseholdProfile,
  type UpdateHouseholdProfileInput,
} from '@mijote/shared';

import {
  centsToEuros,
  eurosToCents,
  joinIngredients,
  splitIngredients,
  toWholeNumber,
} from './fields';

/*
  Le profil tel qu'un formulaire le porte, et sa traduction vers l'API.

  Un champ de saisie porte du texte, y compris quand il demande un nombre, et
  un groupe de choix porte des chaînes : c'est ici, et nulle part ailleurs, que
  tout cela redevient un nombre, un code, un `null` ou une erreur à montrer.
*/

/** Le profil en forme de formulaire : du texte et des chaînes de choix. */
export interface ProfileDraft {
  name: string;
  peopleCount: string;
  goal: string;
  monthlyBudgetEuros: string;
  maxMealMinutes: string;
  varietyBalance: string;
  allergens: string[];
  diets: string[];
  /** Séparés par des virgules, comme le champ les montre. */
  excludedIngredients: string;
}

/** Les champs d'une étape, et donc ceux qu'elle enverra. */
export const HOUSEHOLD_KEYS = ['name', 'peopleCount'] as const;
export const FOOD_KEYS = ['diets', 'allergens', 'excludedIngredients'] as const;
export const PLANNING_KEYS = [
  'goal',
  'monthlyBudgetCents',
  'maxMealMinutes',
  'varietyBalance',
] as const;

/** Tous les champs, pour retrouver celui qu'un chemin d'erreur désigne. */
export const PATCH_KEYS = [...HOUSEHOLD_KEYS, ...FOOD_KEYS, ...PLANNING_KEYS] as const;

export type PatchKey = (typeof PATCH_KEYS)[number];

/** Les messages à montrer sous les champs, par champ. */
export type DraftErrors = Partial<Record<PatchKey, string>>;

/** Un champ à corriger, et la phrase à montrer sous lui. */
export interface DraftIssue {
  key: PatchKey;
  message: string;
}

export type PatchResult =
  { ok: true; patch: UpdateHouseholdProfileInput } | { ok: false; issues: DraftIssue[] };

const WHOLE_NUMBER = 'Indiquez un nombre entier.';
const UNKNOWN_CHOICE = 'Ce choix ne fait pas partie de la liste.';

const INGREDIENT_LIMITS = `Vingt ingrédients au plus, de ${String(MAX_EXCLUDED_INGREDIENT_LENGTH)} caractères.`;

export function toDraft(profile: HouseholdProfile): ProfileDraft {
  return {
    name: profile.name,
    peopleCount: profile.peopleCount === null ? '' : String(profile.peopleCount),
    goal: profile.goal ?? '',
    monthlyBudgetEuros: centsToEuros(profile.monthlyBudgetCents),
    maxMealMinutes: profile.maxMealMinutes === null ? '' : String(profile.maxMealMinutes),
    varietyBalance: profile.varietyBalance,
    allergens: [...profile.allergens],
    diets: [...profile.diets],
    excludedIngredients: joinIngredients(profile.excludedIngredients),
  };
}

/**
 * Un entier saisi, `null` quand le champ est vide, ou l'aveu qu'il est illisible.
 *
 * Les trois cas sont distincts et le restent : vide veut dire « pas répondu »,
 * et illisible veut dire « à corriger ». Les confondre ferait effacer une
 * réponse sur une faute de frappe.
 */
function wholeField(value: string): number | null | 'invalid' {
  if (value.trim() === '') {
    return null;
  }

  return toWholeNumber(value) ?? 'invalid';
}

function budgetField(value: string): number | null | 'invalid' {
  if (value.trim() === '') {
    return null;
  }

  return eurosToCents(value) ?? 'invalid';
}

/**
 * Le corps à envoyer, limité aux champs demandés, ou les champs à corriger.
 *
 * Les clés sont passées par l'appelant, et ce n'est pas un détail : l'étape du
 * budget n'envoie pas les allergènes, qu'elle n'affiche pas et n'a aucune
 * raison de faire voyager (ADR 0016).
 *
 * Un champ vide devient `null`, donc il efface : c'est ce que veut dire
 * effacer une réponse dans un formulaire. Les bornes, elles, ne sont pas
 * vérifiées ici : c'est le schéma partagé qui les porte, des deux côtés.
 */
export function buildPatch(draft: ProfileDraft, keys: readonly PatchKey[]): PatchResult {
  const wanted = new Set<PatchKey>(keys);
  const issues: DraftIssue[] = [];
  const patch: UpdateHouseholdProfileInput = {};

  if (wanted.has('name')) {
    patch.name = draft.name.trim();
  }

  if (wanted.has('peopleCount')) {
    const parsed = wholeField(draft.peopleCount);

    if (parsed === 'invalid') {
      issues.push({ key: 'peopleCount', message: WHOLE_NUMBER });
    } else {
      patch.peopleCount = parsed;
    }
  }

  if (wanted.has('monthlyBudgetCents')) {
    const parsed = budgetField(draft.monthlyBudgetEuros);

    if (parsed === 'invalid') {
      issues.push({ key: 'monthlyBudgetCents', message: WHOLE_NUMBER });
    } else {
      patch.monthlyBudgetCents = parsed;
    }
  }

  if (wanted.has('maxMealMinutes')) {
    const parsed = wholeField(draft.maxMealMinutes);

    if (parsed === 'invalid') {
      issues.push({ key: 'maxMealMinutes', message: WHOLE_NUMBER });
    } else {
      patch.maxMealMinutes = parsed;
    }
  }

  if (wanted.has('goal')) {
    if (draft.goal === '') {
      patch.goal = null;
    } else {
      const parsed = householdGoalSchema.safeParse(draft.goal);

      if (parsed.success) {
        patch.goal = parsed.data;
      } else {
        issues.push({ key: 'goal', message: UNKNOWN_CHOICE });
      }
    }
  }

  if (wanted.has('varietyBalance')) {
    const parsed = varietyBalanceSchema.safeParse(draft.varietyBalance);

    if (parsed.success) {
      patch.varietyBalance = parsed.data;
    } else {
      issues.push({ key: 'varietyBalance', message: UNKNOWN_CHOICE });
    }
  }

  if (wanted.has('allergens')) {
    const parsed = allergensSchema.safeParse(draft.allergens);

    if (parsed.success) {
      patch.allergens = parsed.data;
    } else {
      issues.push({ key: 'allergens', message: UNKNOWN_CHOICE });
    }
  }

  if (wanted.has('diets')) {
    const parsed = dietsSchema.safeParse(draft.diets);

    if (parsed.success) {
      patch.diets = parsed.data;
    } else {
      issues.push({ key: 'diets', message: UNKNOWN_CHOICE });
    }
  }

  if (wanted.has('excludedIngredients')) {
    /*
      Par le schéma partagé, comme les deux autres listes : c'est lui qui
      normalise et dédoublonne, et le refaire ici serait une seconde
      déclaration de la même règle (issue #14).
    */
    const parsed = excludedIngredientsSchema.safeParse(splitIngredients(draft.excludedIngredients));

    if (parsed.success) {
      patch.excludedIngredients = parsed.data;
    } else {
      issues.push({ key: 'excludedIngredients', message: INGREDIENT_LIMITS });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, patch };
}

/*
  Les refus, formulés pour cet écran.

  Les messages sont écrits ici, en français, et non repris de zod : le schéma
  partagé reste la règle, il n'est que sa formulation qui change. Deux cas le
  demandent vraiment : le budget, dont le schéma parle en centimes alors que le
  champ est en euros, et les bornes, qu'une phrase dit mieux qu'un intervalle.
*/
const FIELD_MESSAGES: Partial<Record<PatchKey, string>> = {
  name: `Indiquez un nom de foyer, de 1 à ${String(MAX_HOUSEHOLD_NAME_LENGTH)} caractères.`,
  peopleCount: `Indiquez un nombre de personnes, de ${String(MIN_PEOPLE)} à ${String(MAX_PEOPLE)}.`,
  monthlyBudgetCents: `Indiquez un budget mensuel, de 1 à ${String(MAX_MONTHLY_BUDGET_CENTS / 100)} €.`,
  maxMealMinutes: `Indiquez une durée, de ${String(MIN_MEAL_MINUTES)} à ${String(MAX_MEAL_MINUTES)} minutes.`,
};

/** Le champ visé par un chemin d'erreur, `allergens.0` comptant pour `allergens`. */
function keyOf(field: string): PatchKey | undefined {
  const [first] = field.split('.');

  return PATCH_KEYS.find((key) => key === first);
}

function mapIssues(entries: readonly { field: string; message: string }[]): DraftErrors {
  const errors: DraftErrors = {};

  for (const entry of entries) {
    const key = keyOf(entry.field);

    if (key !== undefined && errors[key] === undefined) {
      errors[key] = FIELD_MESSAGES[key] ?? entry.message;
    }
  }

  return errors;
}

/**
 * Ce que le schéma partagé refuse, avant d'appeler le serveur.
 *
 * La même règle des deux côtés : ceci ne remplace pas la validation de l'API,
 * il évite un aller-retour pour une borne que l'écran connaît déjà.
 */
export function checkPatch(patch: UpdateHouseholdProfileInput): DraftErrors {
  const parsed = updateHouseholdProfileSchema.safeParse(patch);

  if (parsed.success) {
    return {};
  }

  return mapIssues(
    parsed.error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

/** Ce que l'API a refusé, par champ, depuis le problème RFC 9457. */
export function fromProblem(errors: readonly FieldError[] | undefined): DraftErrors {
  return errors === undefined ? {} : mapIssues(errors);
}
