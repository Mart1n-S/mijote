import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationTokenSchema,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type Invitation,
  type InvitationList,
  type InvitationPreview,
  type SessionResponse,
} from '@mijote/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';

import { AuthService } from '../auth/auth.service.js';
import { type CookieSink } from '../auth/auth.controller.js';
import { Public } from '../auth/public.decorator.js';
import { readClientIp, requireAuthenticated } from '../auth/request-context.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../errors/zod-validation.pipe.js';

import { InvitationsService } from './invitations.service.js';

/*
  Les invitations, côté administration et côté invité.

  Les trois routes d'administration demandent le rôle **et** un second facteur
  validé dans la session : c'est la garde de rôle qui le tient (ADR 0012).

  Les deux routes publiques sont dans `CSRF_EXEMPT_ROUTES`, faute de session qui
  porterait un jeton. Elles gardent les deux autres barrières, l'origine et le
  type de média, et ce n'est pas une précaution de style : l'acceptation ouvre
  une session, donc un site tiers pourrait sinon connecter une victime à un
  compte qu'il contrôle (ADR 0013).
*/

const idSchema = z.object({ id: z.uuid() });

@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
  ) {}

  @Roles('admin')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createInvitationSchema)) body: CreateInvitationInput,
    @Req() request: unknown,
  ): Promise<Invitation> {
    return this.invitations.create(requireAuthenticated(request).account, body);
  }

  @Roles('admin')
  @Get()
  async list(): Promise<InvitationList> {
    return { invitations: await this.invitations.list() };
  }

  @Roles('admin')
  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param(new ZodValidationPipe(idSchema)) parameters: z.infer<typeof idSchema>,
  ): Promise<void> {
    await this.invitations.revoke(parameters.id);
  }

  /**
   * L'adresse qu'un lien invite, avant de demander un mot de passe.
   *
   * Un `POST` et non un `GET` : le jeton arrive dans le corps, jamais dans
   * l'URL, où il fuirait par l'en-tête `Referer` et par les journaux du
   * mandataire.
   */
  @Public()
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Body(new ZodValidationPipe(invitationTokenSchema)) body: z.infer<typeof invitationTokenSchema>,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<InvitationPreview> {
    // La réponse porte l'adresse invitée : elle ne se met pas en cache.
    response.setHeader('Cache-Control', 'no-store');

    return this.invitations.preview(body.token);
  }

  /**
   * L'acceptation : le compte est créé, et la session ouverte avec lui.
   *
   * Deux services, et chacun le sien : les invitations consomment le ticket et
   * créent le compte, la connexion sait seule ouvrir une session et poser ses
   * cookies. Le contrôleur n'enchaîne que les deux appels.
   */
  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<SessionResponse> {
    const created = await this.invitations.accept(body.token, body.password, readClientIp(request));
    const opened = await this.auth.openSessionFor(created.accountId);

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', opened.cookies);

    return { account: opened.account, twoFactor: opened.twoFactor };
  }
}
