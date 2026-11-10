import { Module } from '@nestjs/common';

import { DatabaseModule } from '../db/database.module.js';

import { HouseholdRepository } from './household.repository.js';
import { HouseholdsController } from './households.controller.js';
import { HouseholdsService } from './households.service.js';

/**
 * Le foyer et son profil.
 *
 * `HouseholdsService` est exporté : c'est par lui que les modules des lots
 * suivants liront le foyer, et jamais par sa table (`api.md`). C'est aussi la
 * raison pour laquelle l'état du premier lancement n'est pas ajouté à la
 * réponse de session : le module d'authentification n'a pas à lire `household`.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [HouseholdsController],
  providers: [HouseholdRepository, HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
