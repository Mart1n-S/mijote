import {
  ALLERGENS,
  DIETS,
  HOUSEHOLD_GOALS,
  MAX_EXCLUDED_INGREDIENTS,
  VARIETY_BALANCES,
  type Allergen,
  type Diet,
  type HouseholdGoal,
  type VarietyBalance,
} from '@mijote/shared';

import type { ChoiceOption } from '../components/base/choice';

/*
  Les libellés et les conversions des champs du foyer.

  Les libellés sont ici et non dans `packages/shared` : ce sont des textes
  d'interface, et l'API n'affiche rien. Les codes, eux, viennent du paquet
  partagé, donc un code ajouté là sans libellé ici se voit au typage.
*/

/** Les 14 allergènes du règlement (UE) 1169/2011, en français. */
const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  crustaceans: 'Crustacés',
  eggs: 'Œufs',
  fish: 'Poissons',
  peanuts: 'Arachides',
  soy: 'Soja',
  milk: 'Lait',
  'tree-nuts': 'Fruits à coque',
  celery: 'Céleri',
  mustard: 'Moutarde',
  sesame: 'Graines de sésame',
  sulphites: 'Anhydride sulfureux et sulfites',
  lupin: 'Lupin',
  molluscs: 'Mollusques',
};

const DIET_LABELS: Record<Diet, string> = {
  vegetarian: 'Végétarien',
  pescatarian: 'Pescétarien',
  'pork-free': 'Sans porc',
};

const GOAL_LABELS: Record<HouseholdGoal, string> = {
  economy: 'Économiser',
  balance: 'Manger équilibré',
  speed: 'Aller vite',
  mix: 'Un mélange des trois',
};

/**
 * L'équilibre entre variété et réutilisation, dit du point de vue de la
 * personne : ce qu'elle obtient, et non le nom du réglage.
 */
const VARIETY_LABELS: Record<VarietyBalance, string> = {
  variety: 'Varier les ingrédients, quitte à en acheter plus',
  balanced: 'Un peu des deux',
  reuse: 'Réutiliser les ingrédients, quitte à répéter des plats',
};

function toOptions<Value extends string>(
  values: readonly Value[],
  labels: Record<Value, string>,
): ChoiceOption[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const allergenOptions: ChoiceOption[] = toOptions(ALLERGENS, ALLERGEN_LABELS);
export const dietOptions: ChoiceOption[] = toOptions(DIETS, DIET_LABELS);
export const goalOptions: ChoiceOption[] = toOptions(HOUSEHOLD_GOALS, GOAL_LABELS);
export const varietyOptions: ChoiceOption[] = toOptions(VARIETY_BALANCES, VARIETY_LABELS);

/*
  Le budget se saisit en euros entiers et se stocke en centimes.

  Des euros entiers, et non des centimes : un budget de courses mensuel n'a pas
  besoin de cette précision, et l'entier évite la dérive du flottant, qui fait
  valoir 1233,9999999999998 à `Number('12.34') * 100` (ADR 0016).
*/
const CENTS_PER_EURO = 100;

/** Les euros saisis, en centimes. Rien de lisible rend `undefined`. */
export function eurosToCents(value: string): number | undefined {
  const trimmed = value.trim();

  if (trimmed === '' || !/^\d{1,7}$/.test(trimmed)) {
    return undefined;
  }

  return Number(trimmed) * CENTS_PER_EURO;
}

/** Les centimes, en euros entiers, pour remplir le champ. */
export function centsToEuros(value: number | null): string {
  return value === null ? '' : String(Math.round(value / CENTS_PER_EURO));
}

/** Un entier saisi, ou `undefined` si le champ ne porte pas un entier. */
export function toWholeNumber(value: string): number | undefined {
  const trimmed = value.trim();

  return trimmed === '' || !/^\d{1,3}$/.test(trimmed) ? undefined : Number(trimmed);
}

/**
 * Les ingrédients exclus, tels que le champ les porte : séparés par des
 * virgules.
 *
 * Les entrées vides sont retirées ici comme elles le sont côté serveur : « a, ,
 * b » est une frappe, pas une erreur à signaler. La liste est tronquée à ce que
 * le schéma accepte, pour que le champ refuse avant le serveur.
 */
export function splitIngredients(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .slice(0, MAX_EXCLUDED_INGREDIENTS);
}

export function joinIngredients(values: string[]): string {
  return values.join(', ');
}
