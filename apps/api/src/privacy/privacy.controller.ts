import {
  deleteAccountSchema,
  type AccountDeletionState,
  type AccountExport,
  type DeleteAccountInput,
} from '@mijote/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';

import { type CookieSink } from '../auth/auth.controller.js';
import { readClientIp, requireAuthenticated } from '../auth/request-context.js';
import { ZodValidationPipe } from '../errors/zod-validation.pipe.js';

import { PrivacyService } from './privacy.service.js';

/*
  Les deux droits du RGPD, sous `/account`, et l'état que leur écran demande.

  Aucune route ne nomme un compte : c'est celui de la session, comme le foyer
  (ADR 0015). L'export demande une session et rien de plus, et c'est argumenté :
  cette session peut déjà lire le profil complet à l'écran, donc l'export
  n'élargit pas ce qu'elle obtient. Ce qu'un mot de passe doit protéger est
  l'écriture irréversible (ADR 0017).
*/

/** Le nom du fichier proposé au téléchargement, daté du jour. */
function exportFilename(now: Date): string {
  return `mijote-mes-donnees-${now.toISOString().slice(0, 10)}.json`;
}

@Controller('account')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /**
   * Tout ce que l'application sait de ce compte, en un fichier JSON.
   *
   * `no-store`, parce que ce fichier porte le profil du foyer, donc des données
   * de santé : ni le disque du poste ni un intermédiaire n'ont à en garder une
   * copie. Et `attachment`, pour que le navigateur le propose en
   * téléchargement plutôt que de l'afficher.
   */
  @Get('export')
  async export(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<AccountExport> {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportFilename(new Date())}"`,
    );

    return this.privacy.export(requireAuthenticated(request));
  }

  /**
   * La suppression est-elle fermée à ce compte ?
   *
   * Le pendant de `/household/onboarding` : une route qui ne rend qu'un
   * booléen, pour que l'écran n'ait pas à deviner (ADR 0015).
   */
  @Get('deletion')
  async deletionState(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<AccountDeletionState> {
    // Un état propre à un compte : ni le disque du poste ni un intermédiaire
    // n'ont à en garder une copie, comme pour l'état du premier lancement.
    response.setHeader('Cache-Control', 'no-store');

    return this.privacy.deletionState(requireAuthenticated(request));
  }

  /**
   * Supprime le compte, son foyer et ses traces.
   *
   * Un `POST` et non un `DELETE` : la requête porte un corps, et un corps sur
   * `DELETE`, bien que légal, est jeté par nombre de mandataires (ADR 0012).
   *
   * La réponse efface les trois cookies, comme la déconnexion : la session
   * vient d'être supprimée côté serveur, et le navigateur n'a plus rien à
   * garder.
   */
  @Post('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<void> {
    const deleted = await this.privacy.delete(
      requireAuthenticated(request),
      { password: body.password, code: body.code },
      readClientIp(request),
    );

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', deleted.cookies);
  }
}
