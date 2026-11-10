import { z } from 'zod';

/*
  Le profil du foyer, vu des deux côtés.

  Les bornes et les listes fermées sont déclarées **une seule fois**, ici, et
  l'API comme l'écran les appliquent : une règle de longueur ou de liste ne peut
  donc pas diverger entre le formulaire et le serveur (issue #14).

  Trois champs disent quelque chose de la santé de quelqu'un : les allergènes,
  les régimes et, indirectement, les ingrédients exclus. Ce fichier est donc
  aussi l'endroit où se lit ce qui est stocké d'eux, et il n'y a rien de plus
  que des codes d'une liste fermée (ADR 0016).
*/

/**
 * Les 14 allergènes à déclaration obligatoire du règlement (UE) 1169/2011,
 * dans l'ordre de son annexe II.
 *
 * C'est la seule liste à la fois fermée, stable, publique et légalement
 * définie. Le vocabulaire d'allergènes de HelloFresh s'y rattachera en lot 2,
 * par une table de correspondance : les 34 types relevés sur un échantillon de
 * vingt recettes ne sont pas une liste utilisable aujourd'hui, et ils bougeront
 * à la collecte complète (`docs/lot-0/hellofresh.md`).
 */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'tree-nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

/**
 * Les trois régimes que le planning saura honorer.
 *
 * Ce sont les tags que HelloFresh porte réellement (`veggie`, `pescatarian`,
 * `pork-free`). Végétalien n'y est pas : aucun tag `vegan` n'a été relevé, et
 * promettre un régime que le planning ne respectera pas est pire que ne pas le
 * proposer. Le gluten et les œufs n'y sont pas non plus, ce sont des
 * allergènes : les avoir aux deux endroits ferait deux vérités pour la même
 * contrainte (ADR 0016).
 */
export const DIETS = ['vegetarian', 'pescatarian', 'pork-free'] as const;

/** Les quatre objectifs du cahier des charges, section 3. */
export const HOUSEHOLD_GOALS = ['economy', 'balance', 'speed', 'mix'] as const;

/**
 * L'équilibre entre variété et réutilisation des ingrédients.
 *
 * Trois valeurs et non un curseur : un curseur promettrait une précision que
 * le planning n'exploitera pas. Le défaut est `reuse`, la réutilisation étant
 * présentée par le cahier des charges comme « un objectif central du planning,
 * pas un bonus » (section 6), et non comme une préférence parmi d'autres.
 */
export const VARIETY_BALANCES = ['variety', 'balanced', 'reuse'] as const;

export const DEFAULT_VARIETY_BALANCE = 'reuse';

/** Bornes du foyer, toutes appliquées côté serveur. */
export const MIN_PEOPLE = 1;
export const MAX_PEOPLE = 35;

/**
 * Au-delà, les quantités seront estimées.
 *
 * Les paliers de portions de HelloFresh vont de 1 à 6 et ne sont pas
 * proportionnels : au-delà, les quantités s'obtiennent en combinant des paliers
 * réels (8 = 4 + 4, 10 = 6 + 4) et s'affichent comme estimées (cahier des
 * charges, « Portions »). Rien ne calcule cela avant le lot 2 : ce seuil ne
 * sert ici qu'à prévenir la personne là où elle choisit.
 */
export const PEOPLE_ESTIMATED_ABOVE = 6;

export const MAX_HOUSEHOLD_NAME_LENGTH = 60;

/** Un euro au moins, dix mille au plus : des centimes, et un entier. */
export const MIN_MONTHLY_BUDGET_CENTS = 100;
export const MAX_MONTHLY_BUDGET_CENTS = 1_000_000;

export const MIN_MEAL_MINUTES = 5;
export const MAX_MEAL_MINUTES = 180;

/** Vingt entrées de quarante caractères : une liste, pas un journal intime. */
export const MAX_EXCLUDED_INGREDIENTS = 20;
export const MAX_EXCLUDED_INGREDIENT_LENGTH = 40;

export const allergenSchema = z.enum(ALLERGENS);

export type Allergen = z.infer<typeof allergenSchema>;

export const dietSchema = z.enum(DIETS);

export type Diet = z.infer<typeof dietSchema>;

export const householdGoalSchema = z.enum(HOUSEHOLD_GOALS);

export type HouseholdGoal = z.infer<typeof householdGoalSchema>;

export const varietyBalanceSchema = z.enum(VARIETY_BALANCES);

export type VarietyBalance = z.infer<typeof varietyBalanceSchema>;

/**
 * Le nom du foyer : jamais vide, et jamais remis au défaut par un effacement.
 *
 * Effacer son nom n'est pas une demande de revenir à « Mon foyer », c'est une
 * saisie incomplète, et elle se signale.
 */
export const householdNameSchema = z.string().trim().min(1).max(MAX_HOUSEHOLD_NAME_LENGTH);

export const peopleCountSchema = z.number().int().min(MIN_PEOPLE).max(MAX_PEOPLE);

export const monthlyBudgetCentsSchema = z
  .number()
  .int()
  .min(MIN_MONTHLY_BUDGET_CENTS)
  .max(MAX_MONTHLY_BUDGET_CENTS);

export const maxMealMinutesSchema = z.number().int().min(MIN_MEAL_MINUTES).max(MAX_MEAL_MINUTES);

/**
 * Une entrée d'ingrédient exclu, normalisée : minuscules, espaces retirés.
 *
 * La normalisation est dans le schéma, donc l'API la fait aussi : sans elle,
 * « Coriandre » et « coriandre » seraient deux exclusions différentes.
 */
export const excludedIngredientSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(MAX_EXCLUDED_INGREDIENT_LENGTH);

/** Les doublons partent, l'ordre de première apparition reste. */
function unique<Item>(items: Item[]): Item[] {
  return [...new Set(items)];
}

/**
 * Les ingrédients exclus, normalisés et dédoublonnés.
 *
 * Les entrées vides sont retirées plutôt que refusées : l'écran les sépare par
 * des virgules, et « coriandre, , abats » est une frappe, pas une erreur à
 * signaler. La borne de longueur s'applique avant la normalisation, pour que ce
 * qui est traité soit borné.
 */
export const excludedIngredientsSchema = z
  .array(z.string().max(MAX_EXCLUDED_INGREDIENT_LENGTH))
  .max(MAX_EXCLUDED_INGREDIENTS)
  .transform((values) =>
    unique(values.map((value) => value.trim().toLowerCase()).filter((value) => value !== '')),
  )
  /*
    La longueur est revérifiée **après** la normalisation, et pas seulement
    avant : la minuscule de certains caractères tient sur deux unités (le I
    turc, par exemple), donc une entrée de quarante caractères pouvait en
    donner quatre-vingts. La colonne, elle, n'a pas de borne.
  */
  .pipe(z.array(z.string().max(MAX_EXCLUDED_INGREDIENT_LENGTH)));

/** Les allergènes déclarés, dédoublonnés. Un tableau vide est une réponse. */
export const allergensSchema = z
  .array(allergenSchema)
  .max(ALLERGENS.length)
  .transform((values) => unique(values));

export const dietsSchema = z
  .array(dietSchema)
  .max(DIETS.length)
  .transform((values) => unique(values));

/**
 * Le profil tel que l'API le rend.
 *
 * `null` veut dire « pas répondu », et ne vaut aucune valeur : un budget nul
 * n'est pas l'absence de budget. Les trois tableaux, eux, n'ont pas de `null` :
 * « aucun allergène déclaré » et « la question n'a pas été posée » conduisent
 * au même planning, et deux représentations du même état se paieraient en
 * conditions partout (ADR 0016).
 */
export const householdProfileSchema = z.object({
  name: z.string(),
  peopleCount: peopleCountSchema.nullable(),
  goal: householdGoalSchema.nullable(),
  monthlyBudgetCents: monthlyBudgetCentsSchema.nullable(),
  maxMealMinutes: maxMealMinutesSchema.nullable(),
  varietyBalance: varietyBalanceSchema,
  allergens: z.array(allergenSchema),
  diets: z.array(dietSchema),
  excludedIngredients: z.array(z.string()),
  /** Le premier lancement est-il derrière nous ? */
  onboardingDone: z.boolean(),
});

export type HouseholdProfile = z.infer<typeof householdProfileSchema>;

/**
 * Le corps d'une modification, et il est **partiel**.
 *
 * Un champ absent ne change rien, un tableau vide efface. C'est ce qui permet à
 * chaque étape du premier lancement de n'envoyer que ses propres champs : un
 * remplacement complet obligerait l'écran du budget à renvoyer les allergènes,
 * donc à les charger pour rien (ADR 0016).
 *
 * `householdId` n'est pas déclaré, et ne l'est pas par oubli : le foyer vient
 * de la session, et un identifiant envoyé par le client est retiré en silence
 * (ADR 0015).
 */
export const updateHouseholdProfileSchema = z.object({
  name: householdNameSchema.optional(),
  peopleCount: peopleCountSchema.nullable().optional(),
  goal: householdGoalSchema.nullable().optional(),
  monthlyBudgetCents: monthlyBudgetCentsSchema.nullable().optional(),
  maxMealMinutes: maxMealMinutesSchema.nullable().optional(),
  varietyBalance: varietyBalanceSchema.optional(),
  allergens: allergensSchema.optional(),
  diets: dietsSchema.optional(),
  excludedIngredients: excludedIngredientsSchema.optional(),
  /**
   * Marque le premier lancement comme terminé.
   *
   * Seul `true` est accepté : rien n'a de raison de le remettre en avant, et
   * une valeur fausse laisserait un client faire réapparaître le parcours.
   */
  onboardingDone: z.literal(true).optional(),
});

export type UpdateHouseholdProfileInput = z.infer<typeof updateHouseholdProfileSchema>;

/**
 * Ce que la garde de navigation lit au démarrage, et rien de plus.
 *
 * Elle a besoin de savoir si le premier lancement est fait. Lui servir le
 * profil entier ferait voyager des données de santé à chaque démarrage de
 * l'application pour décider d'une redirection (ADR 0015).
 */
export const householdOnboardingSchema = z.object({ done: z.boolean() });

export type HouseholdOnboarding = z.infer<typeof householdOnboardingSchema>;
