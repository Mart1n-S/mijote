import {
  updateHouseholdProfileSchema,
  type HouseholdOnboarding,
  type HouseholdProfile,
  type UpdateHouseholdProfileInput,
} from '@mijote/shared';
import { Body, Controller, Get, Patch, Req, Res } from '@nestjs/common';

import { type CookieSink } from '../auth/auth.controller.js';
import { requireAuthenticated } from '../auth/request-context.js';
import { ZodValidationPipe } from '../errors/zod-validation.pipe.js';

import { HouseholdsService } from './households.service.js';

/*
  Le profil du foyer.

  **Aucune route ne nomme un foyer** : pas d'identifiant dans le chemin, pas
  d'identifiant dans le corps. Le foyer vient de la session, et le singulier de
  `household` dit exactement cela : du point de vue d'une session, il n'y en a
  qu'un, le sien (ADR 0015).

  Les trois routes demandent une session, le rôle ordinaire suffit, et elles
  n'ajoutent rien à `CSRF_EXEMPT_ROUTES` : une session existe, donc elle porte
  un secret CSRF. C'est la première story du lot dans ce cas.
*/

/**
 * Interdit toute copie de la réponse.
 *
 * Les deux routes du profil rendent des données de santé, et celle du premier
 * lancement un état propre à un compte : ni le disque du poste ni un
 * intermédiaire n'ont à en garder une copie (ADR 0016).
 */
function noStore(response: CookieSink): void {
  response.setHeader('Cache-Control', 'no-store');
}

/** Le foyer de la session, seule source possible (ADR 0015). */
function householdOf(request: unknown): string {
  return requireAuthenticated(request).account.householdId;
}

@Controller('household')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get('profile')
  async profile(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<HouseholdProfile> {
    noStore(response);

    return this.households.profile(householdOf(request));
  }

  /**
   * L'état du premier lancement, et rien d'autre.
   *
   * La garde de navigation l'appelle à chaque démarrage de l'application : lui
   * servir le profil entier ferait voyager des données de santé pour décider
   * d'une redirection (ADR 0015).
   */
  @Get('onboarding')
  async onboarding(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<HouseholdOnboarding> {
    noStore(response);

    return this.households.onboarding(householdOf(request));
  }

  /**
   * Modifie le profil, par champs présents.
   *
   * `PATCH` et non `PUT` : un remplacement complet obligerait l'écran du budget
   * à renvoyer les allergènes, donc à les charger pour rien (ADR 0016).
   */
  @Patch('profile')
  async update(
    @Body(new ZodValidationPipe(updateHouseholdProfileSchema)) body: UpdateHouseholdProfileInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<HouseholdProfile> {
    noStore(response);

    return this.households.update(householdOf(request), body);
  }
}
