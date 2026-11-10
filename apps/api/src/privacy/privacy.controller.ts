import { type AccountExport } from '@mijote/shared';
import { Controller, Get, Req, Res } from '@nestjs/common';

import { type CookieSink } from '../auth/auth.controller.js';
import { requireAuthenticated } from '../auth/request-context.js';

import { PrivacyService } from './privacy.service.js';

/*
  Les deux droits du RGPD, sous `/account`.

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
}
