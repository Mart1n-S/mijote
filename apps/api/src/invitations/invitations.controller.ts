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

import { SESSION_COOKIE } from '../auth/auth.cookies.js';
import { AuthService } from '../auth/auth.service.js';
import { type CookieSink } from '../auth/auth.controller.js';
import { Public } from '../auth/public.decorator.js';
import { readClientIp, readRequestCookie, requireAuthenticated } from '../auth/request-context.js';
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

/**
 * Interdit la mise en cache d'une réponse.
 *
 * Les cinq routes la portent : chacune rend au moins une adresse e-mail, et
 * une liste d'administration en rend jusqu'à deux cents. Ni le disque du poste
 * ni un intermédiaire n'ont à en garder une copie, comme pour la session
 * (`auth.controller.ts`).
 */
function noStore(response: CookieSink): void {
  response.setHeader('Cache-Control', 'no-store');
}

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
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<Invitation> {
    noStore(response);

    return this.invitations.create(requireAuthenticated(request).account, body);
  }

  @Roles('admin')
  @Get()
  async list(@Res({ passthrough: true }) response: CookieSink): Promise<InvitationList> {
    noStore(response);

    return { invitations: await this.invitations.list() };
  }

  @Roles('admin')
  @Post(':id/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Param(new ZodValidationPipe(idSchema)) parameters: z.infer<typeof idSchema>,
    @Req() request: unknown,
  ): Promise<void> {
    // L'acteur est passé au service, qui l'écrit au journal : une action
    // d'administration est attribuée (security.md).
    await this.invitations.revoke(requireAuthenticated(request).account, parameters.id);
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
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<InvitationPreview> {
    noStore(response);

    return this.invitations.preview(body.token, readClientIp(request));
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
    /*
      La session précédente de ce navigateur est fermée, comme à la connexion :
      ce chemin est public, donc quelqu'un de déjà connecté peut ouvrir un lien
      d'invitation. Sans cela, sa session resterait valable côté serveur alors
      que son cookie vient d'être remplacé, et plus rien ne pourrait la fermer.
    */
    const opened = await this.auth.openSessionFor(
      created.accountId,
      readRequestCookie(request, SESSION_COOKIE),
    );

    noStore(response);
    response.setHeader('Set-Cookie', opened.cookies);

    return { account: opened.account, twoFactor: opened.twoFactor };
  }
}
