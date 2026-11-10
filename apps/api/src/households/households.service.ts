import type {
  HouseholdOnboarding,
  HouseholdProfile,
  UpdateHouseholdProfileInput,
} from '@mijote/shared';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { Transaction } from '../db/client.js';

import {
  type HouseholdProfileChanges,
  type HouseholdProfileRecord,
  HouseholdRepository,
} from './household.repository.js';

/*
  Le profil du foyer.

  Le foyer n'est jamais choisi ici : son identifiant arrive du contrôleur, qui
  le tient de la session, et aucune route ne permet d'en nommer un autre
  (ADR 0015).
*/

/**
 * Ce que ce service journalise, et rien de plus.
 *
 * Une seule méthode, et une seule ligne : « le profil de ce foyer a changé ».
 * Ni les valeurs, ni la liste des champs modifiés, parce que « ce foyer a
 * changé ses allergènes » est déjà une information de santé (ADR 0016).
 */
export interface ProfileLog {
  setContext(context: string): void;
  info(object: object, message: string): void;
}

/** Ce que le profil lit et écrit, et rien de plus. */
export interface HouseholdStore {
  deleteWithin(transaction: Transaction, householdId: string): Promise<number>;
  findProfile(householdId: string): Promise<HouseholdProfileRecord | undefined>;
  findOnboardingDoneAt(householdId: string): Promise<{ doneAt: Date | null } | undefined>;
  updateProfile(householdId: string, changes: HouseholdProfileChanges): Promise<boolean>;
}

/** Le profil tel qu'il part au navigateur. */
function toProfile(record: HouseholdProfileRecord): HouseholdProfile {
  return {
    name: record.name,
    peopleCount: record.peopleCount,
    goal: record.goal,
    monthlyBudgetCents: record.monthlyBudgetCents,
    maxMealMinutes: record.maxMealMinutes,
    varietyBalance: record.varietyBalance,
    allergens: record.allergens,
    diets: record.diets,
    excludedIngredients: record.excludedIngredients,
    onboardingDone: record.onboardingDoneAt !== null,
  };
}

/**
 * Traduit le corps reçu en colonnes à écrire.
 *
 * Les clés absentes restent absentes, et c'est tout le contrat du PATCH : un
 * champ qu'on ne mentionne pas ne change pas. `onboardingDone: true` devient
 * une date, qui est ce que la colonne porte.
 *
 * Écrite clé par clé plutôt que par un étalement de l'entrée : `exactOptional`
 * interdit de poser une clé à `undefined`, et un étalement recopierait aussi
 * `onboardingDone`, qui n'est pas une colonne.
 */
function toChanges(input: UpdateHouseholdProfileInput, now: Date): HouseholdProfileChanges {
  const changes: HouseholdProfileChanges = {};

  if (input.name !== undefined) {
    changes.name = input.name;
  }

  if (input.peopleCount !== undefined) {
    changes.peopleCount = input.peopleCount;
  }

  if (input.goal !== undefined) {
    changes.goal = input.goal;
  }

  if (input.monthlyBudgetCents !== undefined) {
    changes.monthlyBudgetCents = input.monthlyBudgetCents;
  }

  if (input.maxMealMinutes !== undefined) {
    changes.maxMealMinutes = input.maxMealMinutes;
  }

  if (input.varietyBalance !== undefined) {
    changes.varietyBalance = input.varietyBalance;
  }

  if (input.allergens !== undefined) {
    changes.allergens = input.allergens;
  }

  if (input.diets !== undefined) {
    changes.diets = input.diets;
  }

  if (input.excludedIngredients !== undefined) {
    changes.excludedIngredients = input.excludedIngredients;
  }

  if (input.onboardingDone === true) {
    changes.onboardingDoneAt = now;
  }

  return changes;
}

@Injectable()
export class HouseholdsService {
  constructor(
    @Inject(HouseholdRepository) private readonly households: HouseholdStore,
    @Inject(PinoLogger) private readonly logger: ProfileLog,
  ) {
    this.logger.setContext(HouseholdsService.name);
  }

  async profile(householdId: string): Promise<HouseholdProfile> {
    return toProfile(await this.require(householdId));
  }

  /**
   * Supprime le foyer de ce compte, dans la transaction donnée.
   *
   * Le profil et ses données de santé partent avec lui, puisque ce sont ses
   * colonnes (ADR 0016).
   */
  async deleteWithin(transaction: Transaction, householdId: string): Promise<number> {
    return this.households.deleteWithin(transaction, householdId);
  }

  /**
   * Ce que l'export emporte du foyer : sa date, et tout son profil.
   *
   * Par le service et non par la table : un module n'accède pas aux tables d'un
   * autre (`api.md`), et c'est ce qui permet au module des droits RGPD de
   * n'avoir aucune requête à lui.
   */
  async exportable(householdId: string): Promise<{ createdAt: string; profile: HouseholdProfile }> {
    const record = await this.require(householdId);

    return { createdAt: record.createdAt.toISOString(), profile: toProfile(record) };
  }

  /** L'état du premier lancement, pour la garde de navigation. */
  async onboarding(householdId: string): Promise<HouseholdOnboarding> {
    const found = await this.households.findOnboardingDoneAt(householdId);

    if (found === undefined) {
      throw this.missing();
    }

    return { done: found.doneAt !== null };
  }

  /**
   * Modifie les champs présents, et rend le profil complet.
   *
   * Un corps vide est accepté et n'écrit rien : chaque étape du premier
   * lancement envoie ses propres champs, et « passer » n'en envoie aucun.
   */
  async update(householdId: string, input: UpdateHouseholdProfileInput): Promise<HouseholdProfile> {
    const changes = toChanges(input, new Date());

    if (Object.keys(changes).length > 0) {
      if (!(await this.households.updateProfile(householdId, changes))) {
        throw this.missing();
      }

      // L'identifiant du foyer, et rien d'autre : ni les valeurs, ni même les
      // champs touchés (ADR 0016).
      this.logger.info({ householdId }, 'profil du foyer modifié');
    }

    return this.profile(householdId);
  }

  private async require(householdId: string): Promise<HouseholdProfileRecord> {
    const found = await this.households.findProfile(householdId);

    if (found === undefined) {
      throw this.missing();
    }

    return found;
  }

  /**
   * Le foyer de la session est introuvable.
   *
   * Ce n'est pas un 404 : l'identifiant vient de la session, et la clé
   * étrangère du compte garantit son foyer. Son absence est un défaut de
   * données ou de branchement, donc une erreur inattendue (500 générique et
   * journal), comme `requireAuthenticated` pour une session manquante.
   */
  private missing(): Error {
    return new Error('le foyer de la session connectée est introuvable');
  }
}
