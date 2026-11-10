import type { Allergen, Diet, HouseholdGoal, VarietyBalance } from '@mijote/shared';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';
import { DATABASE } from '../db/database.module.js';
import { household } from '../db/schema.js';

/*
  Les requêtes SQL du profil du foyer.

  **Chaque requête filtre par `household.id`**, y compris celles qui ne peuvent
  toucher qu'une ligne puisque l'identifiant vient de la session. Ce n'est pas
  une redondance : c'est ce qui rend la requête juste par elle-même, le jour où
  un autre appelant lui passera un identifiant qui ne vient pas d'une session
  (un export, une commande de maintenance). Voir l'ADR 0015.
*/

/** Le profil, tel que le service le lit. */
export interface HouseholdProfileRecord {
  name: string;
  /** Depuis quand ce foyer existe. Lue par l'export (ADR 0017). */
  createdAt: Date;
  peopleCount: number | null;
  goal: HouseholdGoal | null;
  monthlyBudgetCents: number | null;
  maxMealMinutes: number | null;
  varietyBalance: VarietyBalance;
  allergens: Allergen[];
  diets: Diet[];
  excludedIngredients: string[];
  onboardingDoneAt: Date | null;
}

/**
 * Ce qu'une modification peut changer.
 *
 * Toutes les clés sont facultatives, et c'est le sujet : un champ absent ne
 * change rien, là où un champ à `null` efface une réponse (ADR 0016).
 */
export type HouseholdProfileChanges = Partial<
  Omit<HouseholdProfileRecord, 'name' | 'createdAt'>
> & {
  name?: string;
};

const COLUMNS = {
  name: household.name,
  createdAt: household.createdAt,
  peopleCount: household.peopleCount,
  goal: household.goal,
  monthlyBudgetCents: household.monthlyBudgetCents,
  maxMealMinutes: household.maxMealMinutes,
  varietyBalance: household.varietyBalance,
  allergens: household.allergens,
  diets: household.diets,
  excludedIngredients: household.excludedIngredients,
  onboardingDoneAt: household.onboardingDoneAt,
};

@Injectable()
export class HouseholdRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findProfile(householdId: string): Promise<HouseholdProfileRecord | undefined> {
    const [row] = await this.database
      .select(COLUMNS)
      .from(household)
      .where(eq(household.id, householdId))
      .limit(1);

    return row;
  }

  /**
   * L'état du premier lancement, et rien d'autre.
   *
   * Une requête à part, et une seule colonne : la garde de navigation du front
   * appelle cette route à chaque démarrage, et le profil porte des données de
   * santé qu'elle n'a aucune raison de transporter (ADR 0015).
   */
  async findOnboardingDoneAt(householdId: string): Promise<{ doneAt: Date | null } | undefined> {
    const [row] = await this.database
      .select({ doneAt: household.onboardingDoneAt })
      .from(household)
      .where(eq(household.id, householdId))
      .limit(1);

    return row;
  }

  /**
   * Écrit les champs présents, et eux seuls.
   *
   * L'appelant ne doit pas appeler avec un ensemble vide : Drizzle refuse un
   * `set` sans valeur, et une modification qui ne change rien n'a pas de
   * requête à faire.
   */
  async updateProfile(householdId: string, changes: HouseholdProfileChanges): Promise<boolean> {
    if (Object.keys(changes).length === 0) {
      throw new Error("une modification de profil sans aucun champ n'a rien à écrire");
    }

    const updated = await this.database
      .update(household)
      .set({
        ...changes,
        /*
          La date du premier lancement ne s'écrit qu'une fois : `coalesce` garde
          celle qui est déjà là. Sans cela, chaque corps portant
          `onboardingDone: true` la réécrivait, et la colonne cessait de dire
          **quand** le parcours a été terminé.
        */
        ...(changes.onboardingDoneAt === undefined
          ? {}
          : {
              onboardingDoneAt: sql`coalesce(${household.onboardingDoneAt}, ${changes.onboardingDoneAt})`,
            }),
      })
      .where(eq(household.id, householdId))
      .returning({ id: household.id });

    return updated.length > 0;
  }
}
