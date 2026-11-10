import type { HouseholdProfile } from '@mijote/shared';
import { describe, expect, it } from 'vitest';

import {
  buildPatch,
  checkPatch,
  FOOD_KEYS,
  fromProblem,
  HOUSEHOLD_KEYS,
  PATCH_KEYS,
  PLANNING_KEYS,
  toDraft,
  type ProfileDraft,
} from './draft';
import { centsToEuros, eurosToCents, splitIngredients } from './fields';

/*
  La traduction entre le formulaire et l'API.

  C'est là que le texte d'un champ redevient un nombre, un code ou un `null`,
  donc là que se mesurent les trois intentions du PATCH : ne pas toucher,
  effacer une réponse, et déclarer qu'il n'y a rien à déclarer.
*/

const PROFILE: HouseholdProfile = {
  name: 'Chez moi',
  peopleCount: 4,
  goal: 'balance',
  monthlyBudgetCents: 18_000,
  maxMealMinutes: 30,
  varietyBalance: 'reuse',
  allergens: ['milk'],
  diets: ['vegetarian'],
  excludedIngredients: ['coriandre', 'abats'],
  onboardingDone: true,
};

function draftOf(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return { ...toDraft(PROFILE), ...overrides };
}

describe('le brouillon', () => {
  it('remplit les champs depuis le profil', () => {
    expect(toDraft(PROFILE)).toEqual({
      name: 'Chez moi',
      peopleCount: '4',
      goal: 'balance',
      // Des centimes vers des euros entiers, qui est ce que le champ montre.
      monthlyBudgetEuros: '180',
      maxMealMinutes: '30',
      varietyBalance: 'reuse',
      allergens: ['milk'],
      diets: ['vegetarian'],
      excludedIngredients: 'coriandre, abats',
    });
  });

  it('montre un champ vide pour une réponse absente', () => {
    const empty = toDraft({
      ...PROFILE,
      peopleCount: null,
      goal: null,
      monthlyBudgetCents: null,
      maxMealMinutes: null,
    });

    expect(empty.peopleCount).toBe('');
    expect(empty.goal).toBe('');
    expect(empty.monthlyBudgetEuros).toBe('');
    expect(empty.maxMealMinutes).toBe('');
  });
});

describe('le corps envoyé', () => {
  it("ne porte que les champs de l'étape demandée", () => {
    /*
      Le point qui compte : l'étape du budget n'envoie pas les allergènes,
      qu'elle n'affiche pas et n'a aucune raison de faire voyager (ADR 0016).
    */
    const built = buildPatch(draftOf(), PLANNING_KEYS);

    expect(built.ok).toBe(true);

    if (built.ok) {
      expect(Object.keys(built.patch).sort()).toEqual([
        'goal',
        'maxMealMinutes',
        'monthlyBudgetCents',
        'varietyBalance',
      ]);
      expect('allergens' in built.patch).toBe(false);
    }
  });

  it('convertit les euros saisis en centimes', () => {
    const built = buildPatch(draftOf({ monthlyBudgetEuros: '180' }), PLANNING_KEYS);

    expect(built.ok && built.patch.monthlyBudgetCents).toBe(18_000);
  });

  it('efface une réponse quand le champ est vidé', () => {
    const built = buildPatch(
      draftOf({ peopleCount: '', monthlyBudgetEuros: '', maxMealMinutes: '', goal: '' }),
      PATCH_KEYS,
    );

    expect(built.ok).toBe(true);

    if (built.ok) {
      expect(built.patch.peopleCount).toBeNull();
      expect(built.patch.monthlyBudgetCents).toBeNull();
      expect(built.patch.maxMealMinutes).toBeNull();
      expect(built.patch.goal).toBeNull();
    }
  });

  it('efface une liste quand elle est vidée, et la garde sinon', () => {
    const cleared = buildPatch(
      draftOf({ allergens: [], diets: [], excludedIngredients: '' }),
      FOOD_KEYS,
    );

    expect(cleared.ok).toBe(true);

    if (cleared.ok) {
      expect(cleared.patch.allergens).toEqual([]);
      expect(cleared.patch.diets).toEqual([]);
      expect(cleared.patch.excludedIngredients).toEqual([]);
    }

    const kept = buildPatch(draftOf(), FOOD_KEYS);

    expect(kept.ok && kept.patch.allergens).toEqual(['milk']);
  });

  it('normalise et dédoublonne les ingrédients exclus', () => {
    const built = buildPatch(
      draftOf({ excludedIngredients: ' Coriandre , coriandre,, abats ' }),
      FOOD_KEYS,
    );

    expect(built.ok && built.patch.excludedIngredients).toEqual(['coriandre', 'abats']);
  });

  it("signale un champ illisible au lieu d'effacer la réponse", () => {
    /*
      Une faute de frappe dans un champ numérique ne doit pas valoir « efface
      cette réponse » : les deux cas sont distincts, et celui-ci se corrige.
    */
    const built = buildPatch(draftOf({ peopleCount: 'quatre' }), HOUSEHOLD_KEYS);

    expect(built.ok).toBe(false);

    if (!built.ok) {
      expect(built.issues).toEqual([{ key: 'peopleCount', message: 'Indiquez un nombre entier.' }]);
    }
  });
});

describe('les refus', () => {
  it('reformule les bornes du schéma partagé pour cet écran', () => {
    // Le schéma parle en centimes, le champ est en euros : le message dit des
    // euros (ADR 0016).
    expect(checkPatch({ monthlyBudgetCents: 50 }).monthlyBudgetCents).toBe(
      'Indiquez un budget mensuel, de 1 à 10000 €.',
    );
    expect(checkPatch({ peopleCount: 40 }).peopleCount).toBe(
      'Indiquez un nombre de personnes, de 1 à 35.',
    );
    expect(checkPatch({ peopleCount: 4 })).toEqual({});
  });

  it("remet un refus de l'API sous son champ", () => {
    expect(
      fromProblem([
        { field: 'allergens.0', message: 'Option invalide' },
        { field: 'peopleCount', message: 'Trop grand' },
      ]),
    ).toEqual({
      allergens: 'Option invalide',
      peopleCount: 'Indiquez un nombre de personnes, de 1 à 35.',
    });
  });

  it('ignore un champ que cet écran ne connaît pas', () => {
    expect(fromProblem([{ field: 'body', message: 'peu importe' }])).toEqual({});
    expect(fromProblem(undefined)).toEqual({});
  });
});

describe('les conversions', () => {
  it("rend undefined sur ce qui n'est pas un nombre", () => {
    expect(eurosToCents('180')).toBe(18_000);
    expect(eurosToCents('180,50')).toBeUndefined();
    expect(eurosToCents('')).toBeUndefined();
    expect(eurosToCents('-5')).toBeUndefined();
  });

  it('arrondit les centimes en euros entiers pour le champ', () => {
    expect(centsToEuros(18_050)).toBe('181');
    expect(centsToEuros(null)).toBe('');
  });

  it("borne la liste d'ingrédients à ce que le schéma accepte", () => {
    const many = Array.from({ length: 25 }, (_, index) => `x${String(index)}`).join(',');

    expect(splitIngredients(many)).toHaveLength(20);
  });
});
