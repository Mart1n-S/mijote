import { loginSchema, type LoginInput, type SessionResponse } from '@mijote/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';

import { ProblemException } from '../errors/problem.exception.js';
import { ZodValidationPipe } from '../errors/zod-validation.pipe.js';

import { REMEMBER_COOKIE, SESSION_COOKIE } from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { readClientIp, readRequestCookie, requireAuthenticated } from './request-context.js';
import { AUTH_REQUIRED } from './session.guard.js';

/**
 * Ce que le contrôleur écrit sur la réponse, et rien de plus.
 *
 * Les types d'Express ne sont pas installés : cette forme réduite suffit, et
 * elle dit exactement ce que le contrôleur se permet de faire.
 */
export interface CookieSink {
  setHeader(name: string, value: string | string[]): void;
}

/**
 * Pose les cookies, et interdit toute copie de la réponse.
 *
 * `no-store` parce que ces réponses portent un `Set-Cookie`, donc le jeton de
 * session, et l'adresse du compte connecté : ni le disque du poste ni un
 * intermédiaire n'ont à en garder une copie après la session.
 */
function writeSession(response: CookieSink, cookies: string[]): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Set-Cookie', cookies);
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * La connexion.
   *
   * Ouverte sans session, forcément, et c'est la seule route qui modifie
   * l'état sans en-tête CSRF (voir CSRF_EXEMPT_ROUTES).
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<SessionResponse> {
    const { account, cookies } = await this.auth.login(
      body,
      readClientIp(request),
      /*
        La session présentée, s'il y en a une : se reconnecter ferme celle de ce
        navigateur plutôt que de la laisser valable jusqu'à sa limite. Quelqu'un
        qui se reconnecte en soupçonnant un vol ferme ainsi quelque chose.
      */
      readRequestCookie(request, SESSION_COOKIE),
    );

    writeSession(response, cookies);

    return { account };
  }

  /**
   * Le compte connecté, et la reprise d'une session mémorisée.
   *
   * Le front appelle cette route au démarrage. Elle est ouverte parce qu'un
   * navigateur rouvert n'a plus de session : c'est ici, et nulle part ailleurs,
   * que le cookie de mémorisation en ouvre une nouvelle.
   *
   * Un 401 veut donc dire « personne n'est connecté », et le front l'entend
   * ainsi plutôt que comme une erreur.
   */
  @Public()
  @Get('session')
  async current(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<SessionResponse> {
    const resolved = await this.auth.current({
      session: readRequestCookie(request, SESSION_COOKIE),
      remember: readRequestCookie(request, REMEMBER_COOKIE),
    });

    if (resolved === undefined) {
      throw new ProblemException(HttpStatus.UNAUTHORIZED, AUTH_REQUIRED);
    }

    writeSession(response, resolved.cookies);

    return { account: resolved.account };
  }

  /** La déconnexion : la session et le jeton de cet appareil, et eux seuls. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<void> {
    const cookies = await this.auth.logout(
      requireAuthenticated(request),
      readRequestCookie(request, REMEMBER_COOKIE),
    );

    writeSession(response, cookies);
  }
}
