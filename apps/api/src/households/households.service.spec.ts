import { beforeEach, describe, expect, it } from 'vitest';

import type { HouseholdProfileChanges, HouseholdProfileRecord } from './household.repository.js';
import { HouseholdsService, type HouseholdStore, type ProfileLog } from './households.service.js';

/*
  Le profil du foyer sans HTTP et sans PostgreSQL : le vrai service, branché sur
  deux foyers en mémoire.

  Ce fichier mesure le contrat du PATCH partiel (un champ absent ne change
  rien, un champ nul efface, un tableau vide déclare qu'il n'y a rien à
  déclarer) et ce que les journaux n'écrivent pas.

  L'isolement vu du SQL, et une session qui tente le foyer d'un autre, se
  mesurent dans households.integration.spec.ts, contre une vraie base.
*/

const MINE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function emptyProfile(name: string): HouseholdProfileRecord {
  return {
    name,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    peopleCount: null,
    goal: null,
    monthlyBudgetCents: null,
    maxMealMinutes: null,
    varietyBalance: 'reuse',
    allergens: [],
    diets: [],
    excludedIngredients: [],
    onboardingDoneAt: null,
  };
}

class MemoryHouseholds implements HouseholdStore {
  readonly rows = new Map<string, HouseholdProfileRecord>([
    [MINE, emptyProfile('Mon foyer')],
    [OTHER, emptyProfile('Chez le voisin')],
  ]);

  /** Les identifiants écrits, dans l'ordre : c'est ce qui dit qui a bougé. */
  readonly written: string[] = [];

  /*
    La transaction n'est pas jouée ici : ce que la cascade emporte se mesure
    contre une vraie base, dans privacy.integration.spec.ts. Ce faux ne retient
    que le foyer visé.
  */
  deleteWithin(_transaction: unknown, householdId: string): Promise<number> {
    return Promise.resolve(this.rows.delete(householdId) ? 1 : 0);
  }

  findProfile(householdId: string): Promise<HouseholdProfileRecord | undefined> {
    const row = this.rows.get(householdId);

    return Promise.resolve(row === undefined ? undefined : { ...row });
  }

  findOnboardingDoneAt(householdId: string): Promise<{ doneAt: Date | null } | undefined> {
    const row = this.rows.get(householdId);

    return Promise.resolve(row === undefined ? undefined : { doneAt: row.onboardingDoneAt });
  }

  updateProfile(householdId: string, changes: HouseholdProfileChanges): Promise<boolean> {
    const row = this.rows.get(householdId);

    if (row === undefined) {
      return Promise.resolve(false);
    }

    this.written.push(householdId);
    this.rows.set(householdId, { ...row, ...changes });

    return Promise.resolve(true);
  }
}

class RecordingLog implements ProfileLog {
  readonly lines: { object: object; message: string }[] = [];

  setContext(): void {
    // Rien : le contexte ne change pas ce que les lignes portent.
  }

  info(object: object, message: string): void {
    this.lines.push({ object, message });
  }

  dump(): string {
    return JSON.stringify(this.lines);
  }
}

let store: MemoryHouseholds;
let log: RecordingLog;
let service: HouseholdsService;

beforeEach(() => {
  store = new MemoryHouseholds();
  log = new RecordingLog();
  service = new HouseholdsService(store, log);
});

describe('le profil du foyer', () => {
  it('rend le foyer demandé, avec ses défauts', async () => {
    const profile = await service.profile(MINE);

    expect(profile).toEqual({
      name: 'Mon foyer',
      peopleCount: null,
      goal: null,
      monthlyBudgetCents: null,
      maxMealMinutes: null,
      // La thèse du projet est le défaut, pas un milieu neutre (ADR 0016).
      varietyBalance: 'reuse',
      allergens: [],
      diets: [],
      excludedIngredients: [],
      onboardingDone: false,
    });
  });

  it('ne rend que le booléen du premier lancement sur sa route', async () => {
    /*
      La garde de navigation appelle celle-ci à chaque démarrage : elle ne doit
      rien transporter du profil, qui porte des données de santé (ADR 0015).
    */
    expect(await service.onboarding(MINE)).toEqual({ done: false });

    await service.update(MINE, { onboardingDone: true });

    expect(await service.onboarding(MINE)).toEqual({ done: true });
  });

  it('remonte une erreur inattendue quand le foyer de la session manque', async () => {
    // Pas un 404 : l'identifiant vient de la session, et la clé étrangère du
    // compte garantit son foyer.
    await expect(service.profile('33333333-3333-4333-8333-000000000000')).rejects.toThrow(
      /introuvable/,
    );
  });
});

describe('la modification partielle', () => {
  it("n'écrit rien quand le corps est vide, et rend le profil", async () => {
    // « Passer cette étape » n'envoie aucun champ.
    const profile = await service.update(MINE, {});

    expect(store.written).toEqual([]);
    expect(log.lines).toEqual([]);
    expect(profile.name).toBe('Mon foyer');
  });

  it('laisse intact un champ absent', async () => {
    await service.update(MINE, { peopleCount: 4, monthlyBudgetCents: 18_000 });
    await service.update(MINE, { peopleCount: 5 });

    const profile = await service.profile(MINE);

    expect(profile.peopleCount).toBe(5);
    // Le budget n'était pas mentionné : il n'a pas bougé.
    expect(profile.monthlyBudgetCents).toBe(18_000);
  });

  it('efface une réponse quand le champ vaut null', async () => {
    await service.update(MINE, { peopleCount: 4 });
    await service.update(MINE, { peopleCount: null });

    expect((await service.profile(MINE)).peopleCount).toBeNull();
  });

  it('efface les trois tableaux quand ils arrivent vides', async () => {
    /*
      Les deux cas, sur les trois tableaux : un tableau absent ne change rien,
      un tableau vide efface. C'est le contrat du PATCH, et c'est ce qui permet
      de retirer un allergène sans renvoyer tout le profil (ADR 0016).
    */
    await service.update(MINE, {
      allergens: ['milk', 'eggs'],
      diets: ['vegetarian'],
      excludedIngredients: ['coriandre'],
    });

    await service.update(MINE, { peopleCount: 2 });

    const kept = await service.profile(MINE);

    expect(kept.allergens).toEqual(['milk', 'eggs']);
    expect(kept.diets).toEqual(['vegetarian']);
    expect(kept.excludedIngredients).toEqual(['coriandre']);

    await service.update(MINE, { allergens: [], diets: [], excludedIngredients: [] });

    const cleared = await service.profile(MINE);

    expect(cleared.allergens).toEqual([]);
    expect(cleared.diets).toEqual([]);
    expect(cleared.excludedIngredients).toEqual([]);
  });

  it('ne touche que le foyer demandé', async () => {
    await service.update(MINE, { name: 'Chez nous', allergens: ['milk'] });

    const other = await service.profile(OTHER);

    expect(store.written).toEqual([MINE]);
    expect(other.name).toBe('Chez le voisin');
    expect(other.allergens).toEqual([]);
  });

  it('pose la date du premier lancement, et ne la retire jamais', async () => {
    await service.update(MINE, { onboardingDone: true });

    expect((await service.profile(MINE)).onboardingDone).toBe(true);

    // Une modification suivante ne la défait pas : le schéma n'accepte que
    // `true`, et rien n'écrit `null` dans cette colonne.
    await service.update(MINE, { peopleCount: 1 });

    expect((await service.profile(MINE)).onboardingDone).toBe(true);
  });
});

describe('les journaux', () => {
  it("ne portent que l'identifiant du foyer", async () => {
    await service.update(MINE, {
      name: 'Chez nous',
      allergens: ['milk', 'peanuts'],
      diets: ['vegetarian'],
      excludedIngredients: ['coriandre', 'abats'],
      monthlyBudgetCents: 18_000,
    });

    expect(log.lines).toEqual([
      { object: { householdId: MINE }, message: 'profil du foyer modifié' },
    ]);

    /*
      Ni les valeurs, ni le nom du foyer, ni même la liste des champs touchés :
      « ce foyer a changé ses allergènes » est déjà une information de santé
      (ADR 0016).
    */
    for (const forbidden of ['milk', 'peanuts', 'vegetarian', 'coriandre', 'Chez nous', 'allerg']) {
      expect(log.dump(), forbidden).not.toContain(forbidden);
    }
  });
});
