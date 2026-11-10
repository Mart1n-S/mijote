import { describe, expect, it } from 'vitest';

import {
  ALLERGENS,
  DEFAULT_VARIETY_BALANCE,
  DIETS,
  excludedIngredientsSchema,
  householdNameSchema,
  MAX_EXCLUDED_INGREDIENTS,
  maxMealMinutesSchema,
  MAX_PEOPLE,
  monthlyBudgetCentsSchema,
  peopleCountSchema,
  PEOPLE_ESTIMATED_ABOVE,
  updateHouseholdProfileSchema,
  varietyBalanceSchema,
} from './household.js';

/*
  Les règles du profil sont déclarées une seule fois et appliquées des deux
  côtés (issue #14) : c'est donc ici qu'elles se mesurent, une fois, plutôt que
  dans les tests de l'API et dans ceux de l'écran.
*/

describe('les bornes du foyer', () => {
  it('accepte de 1 à 35 personnes, et rien autour', () => {
    expect(peopleCountSchema.safeParse(1).success).toBe(true);
    expect(peopleCountSchema.safeParse(MAX_PEOPLE).success).toBe(true);
    expect(peopleCountSchema.safeParse(0).success).toBe(false);
    expect(peopleCountSchema.safeParse(36).success).toBe(false);
    // Un foyer ne compte pas en demi-personnes.
    expect(peopleCountSchema.safeParse(2.5).success).toBe(false);
    // Et le nombre arrive en nombre : la conversion est le travail de l'écran.
    expect(peopleCountSchema.safeParse('4').success).toBe(false);
  });

  it('place le seuil des quantités estimées à 6, sans borner la saisie', () => {
    /*
      Au-delà de 6, les quantités seront estimées en combinant des paliers
      réels. Le seuil ne refuse rien : il ne sert qu'à prévenir là où la
      personne choisit (ADR 0016).
    */
    expect(PEOPLE_ESTIMATED_ABOVE).toBe(6);
    expect(peopleCountSchema.safeParse(PEOPLE_ESTIMATED_ABOVE + 1).success).toBe(true);
  });

  it('veut un budget en centimes entiers', () => {
    expect(monthlyBudgetCentsSchema.safeParse(18_000).success).toBe(true);
    // 180,50 € n'existe pas en centimes entiers.
    expect(monthlyBudgetCentsSchema.safeParse(18_050.5).success).toBe(false);
    expect(monthlyBudgetCentsSchema.safeParse(0).success).toBe(false);
    expect(monthlyBudgetCentsSchema.safeParse(1_000_001).success).toBe(false);
  });

  it('accepte une durée de 5 à 180 minutes par repas', () => {
    expect(maxMealMinutesSchema.safeParse(5).success).toBe(true);
    expect(maxMealMinutesSchema.safeParse(180).success).toBe(true);
    expect(maxMealMinutesSchema.safeParse(4).success).toBe(false);
    expect(maxMealMinutesSchema.safeParse(181).success).toBe(false);
    expect(maxMealMinutesSchema.safeParse(30.5).success).toBe(false);
  });

  it('refuse un nom de foyer vide ou trop long', () => {
    expect(householdNameSchema.parse('  Chez nous  ')).toBe('Chez nous');
    expect(householdNameSchema.safeParse('   ').success).toBe(false);
    expect(householdNameSchema.safeParse('x'.repeat(61)).success).toBe(false);
  });
});

describe('les listes fermées', () => {
  it('compte les 14 allergènes de la réglementation', () => {
    expect(ALLERGENS).toHaveLength(14);
    expect(ALLERGENS).toContain('gluten');
    expect(ALLERGENS).toContain('molluscs');
  });

  it('ne propose que les trois régimes que le planning saura honorer', () => {
    /*
      Les trois tags que HelloFresh porte réellement. Végétalien n'y est pas :
      promettre un régime que le planning ne respectera pas est pire que ne pas
      le proposer (ADR 0016).
    */
    expect([...DIETS]).toEqual(['vegetarian', 'pescatarian', 'pork-free']);
    expect(updateHouseholdProfileSchema.safeParse({ diets: ['vegan'] }).success).toBe(false);
  });

  it('ne garde du gluten et des œufs que leur allergène', () => {
    // Les avoir aussi en régime ferait deux vérités pour la même contrainte.
    expect([...DIETS]).not.toContain('gluten-free');
    expect([...DIETS]).not.toContain('egg-free');
  });

  it('refuse un code inconnu, et dédoublonne ce qui passe', () => {
    expect(updateHouseholdProfileSchema.safeParse({ allergens: ['noisette'] }).success).toBe(false);
    expect(
      updateHouseholdProfileSchema.parse({ allergens: ['milk', 'milk', 'eggs'] }).allergens,
    ).toEqual(['milk', 'eggs']);
  });

  it('part de la réutilisation, qui est la thèse du projet', () => {
    expect(DEFAULT_VARIETY_BALANCE).toBe('reuse');
    expect(varietyBalanceSchema.safeParse(DEFAULT_VARIETY_BALANCE).success).toBe(true);
  });
});

describe('les ingrédients exclus', () => {
  it('normalise, dédoublonne et laisse tomber les entrées vides', () => {
    // L'écran les sépare par des virgules : une frappe en trop n'est pas une
    // erreur à signaler.
    expect(excludedIngredientsSchema.parse([' Coriandre ', '', 'coriandre', 'abats'])).toEqual([
      'coriandre',
      'abats',
    ]);
  });

  it('borne la longueur après la normalisation, et pas seulement avant', () => {
    /*
      La minuscule du I turc tient sur deux unités : une entrée de quarante
      caractères en donnait quatre-vingts, et la colonne n'a pas de borne.
    */
    const turkish = 'İ'.repeat(40);

    expect(turkish).toHaveLength(40);
    expect(turkish.toLowerCase().length).toBeGreaterThan(40);
    expect(excludedIngredientsSchema.safeParse([turkish]).success).toBe(false);
  });

  it('borne la liste et chaque entrée', () => {
    const tooMany = Array.from({ length: MAX_EXCLUDED_INGREDIENTS + 1 }, (_, index) =>
      String(index),
    );

    expect(excludedIngredientsSchema.safeParse(tooMany).success).toBe(false);
    expect(excludedIngredientsSchema.safeParse(['x'.repeat(41)]).success).toBe(false);
  });
});

describe('la modification partielle', () => {
  it('accepte un sous-ensemble, et même rien', () => {
    expect(updateHouseholdProfileSchema.parse({})).toEqual({});
    expect(updateHouseholdProfileSchema.parse({ peopleCount: 2 })).toEqual({ peopleCount: 2 });
  });

  it('distingue un champ absent, un champ nul et un tableau vide', () => {
    /*
      Les trois sont des intentions différentes : ne pas toucher, effacer une
      réponse, et déclarer qu'il n'y a rien à déclarer (ADR 0016).
    */
    expect('peopleCount' in updateHouseholdProfileSchema.parse({})).toBe(false);
    expect(updateHouseholdProfileSchema.parse({ peopleCount: null }).peopleCount).toBeNull();
    expect(updateHouseholdProfileSchema.parse({ allergens: [] }).allergens).toEqual([]);
  });

  it('retire un identifiant de foyer envoyé par le client', () => {
    /*
      Le foyer vient de la session, et le schéma ne déclare pas cette clé : zod
      la retire. Pas de refus bruyant, qui mettrait une clé envoyée par le
      client dans la réponse d'erreur (ADR 0015).
    */
    const parsed = updateHouseholdProfileSchema.parse({
      householdId: '11111111-1111-4111-8111-111111111111',
      peopleCount: 3,
    });

    expect(parsed).toEqual({ peopleCount: 3 });
  });

  it('ne laisse pas remettre le premier lancement en avant', () => {
    expect(updateHouseholdProfileSchema.parse({ onboardingDone: true }).onboardingDone).toBe(true);
    expect(updateHouseholdProfileSchema.safeParse({ onboardingDone: false }).success).toBe(false);
  });
});
