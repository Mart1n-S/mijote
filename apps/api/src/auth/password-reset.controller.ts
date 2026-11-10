import {
  forgotPasswordSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@mijote/shared';
import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';

import { ZodValidationPipe } from '../errors/zod-validation.pipe.js';

import { type CookieSink } from './auth.controller.js';
import { PasswordResetService } from './password-reset.service.js';
import { Public } from './public.decorator.js';
import { readClientIp } from './request-context.js';

/*
  La réinitialisation d'un mot de passe oublié.

  Un contrôleur à part, et non deux routes de plus sur `/auth` : ce préfixe a sa
  propre politique, publique, sans session à poser et avec sa limitation.

  Les routes sont dans `CSRF_EXEMPT_ROUTES`, faute de session qui porterait un
  jeton. Elles gardent les deux autres barrières, l'origine et le type de
  média : elles changent l'état d'un compte et font partir des e-mails, et une
  page d'un autre site n'a rien à faire là (ADR 0014).
*/
@Controller('auth/password')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  /**
   * Demande un lien de réinitialisation.
   *
   * **202, et toujours le même**, que l'adresse ait un compte ou non : dire
   * autre chose ferait de ce formulaire le moyen de savoir qui a un compte ici.
   * Le temps de réponse ne le dit pas non plus, l'envoi partant détaché.
   *
   * `no-store` parce que le corps reçu porte une adresse e-mail : ni le disque
   * du poste ni un intermédiaire n'ont à en garder une copie.
   */
  @Public()
  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');

    await this.resets.request(body.email, readClientIp(request));
  }

  /**
   * Réinitialise le mot de passe, par le jeton du lien.
   *
   * **204, et aucune session ouverte** : l'écran renvoie vers la connexion.
   * C'est ce qui rend le contournement du second facteur impossible plutôt
   * qu'improbable, là où ouvrir une session ici obligerait à rejouer tout
   * l'embranchement de la connexion sur une route publique (ADR 0014).
   *
   * Le jeton arrive dans le **corps**, jamais dans l'URL : il vient du fragment
   * du lien, que le navigateur n'envoie pas au serveur.
   */
  @Public()
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');

    await this.resets.reset(body.token, body.password, readClientIp(request));
  }
}
