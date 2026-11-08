import {
  backupCodesResponseSchema,
  loginSchema,
  twoFactorCodeSchema,
  twoFactorConfirmSchema,
  twoFactorSetupSchema,
  type BackupCodesResponse,
  type LoginInput,
  type LoginResponse,
  type SessionResponse,
  type TwoFactorCodeInput,
  type TwoFactorConfirmInput,
  type TwoFactorSetupResponse,
} from '@mijote/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { z } from 'zod';

import { ProblemException } from '../errors/problem.exception.js';
import { ZodValidationPipe } from '../errors/zod-validation.pipe.js';

import { REMEMBER_COOKIE, SESSION_COOKIE } from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import {
  readClientIp,
  readRequestCookie,
  requireAuthenticated,
  requirePendingLogin,
} from './request-context.js';
import { AUTH_REQUIRED } from './session.guard.js';
import { TwoFactorPending } from './two-factor.decorator.js';

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

/** Interdit la copie d'une réponse qui ne pose pas de cookie, mais porte un secret. */
function writeSecret(response: CookieSink): void {
  response.setHeader('Cache-Control', 'no-store');
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * La connexion.
   *
   * Ouverte sans session, forcément, et c'est la seule route qui modifie
   * l'état sans en-tête CSRF (voir CSRF_EXEMPT_ROUTES).
   *
   * Elle répond deux choses : la session ouverte, ou l'attente d'un code quand
   * le compte a un second facteur. Dans ce second cas, aucune session n'est
   * ouverte et les cookies posés ne permettent que de soumettre le code.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(
      body,
      readClientIp(request),
      /*
        La session présentée, s'il y en a une : se reconnecter ferme celle de ce
        navigateur plutôt que de la laisser valable jusqu'à sa limite. Quelqu'un
        qui se reconnecte en soupçonnant un vol ferme ainsi quelque chose.
      */
      readRequestCookie(request, SESSION_COOKIE),
    );

    writeSession(response, result.cookies);

    if ('twoFactorRequired' in result) {
      return { twoFactorRequired: true };
    }

    return { account: result.account, twoFactor: result.twoFactor };
  }

  /**
   * La soumission du code, après le mot de passe.
   *
   * `@TwoFactorPending()` et non `@Public()` : la route demande une attente
   * valide, qui porte son propre secret CSRF. Elle garde donc les trois
   * barrières, et la liste des routes exemptées reste à une entrée.
   */
  @TwoFactorPending()
  @Post('two-factor')
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(
    @Body(new ZodValidationPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<SessionResponse> {
    const resolved = await this.auth.completeTwoFactor(
      requirePendingLogin(request),
      body.code,
      readClientIp(request),
    );

    writeSession(response, resolved.cookies);

    return { account: resolved.account, twoFactor: resolved.twoFactor };
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

    return { account: resolved.account, twoFactor: resolved.twoFactor };
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

  /**
   * Commence l'inscription d'une application d'authentification.
   *
   * La réponse porte le secret, en clair, deux fois : dans l'URI du QR code et
   * dans la clé en texte. D'où `no-store`, et le mot de passe redemandé.
   */
  @Post('two-factor/setup')
  @HttpCode(HttpStatus.OK)
  async setupTwoFactor(
    @Body(new ZodValidationPipe(twoFactorSetupSchema))
    body: z.infer<typeof twoFactorSetupSchema>,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<TwoFactorSetupResponse> {
    const started = await this.auth.startTwoFactorSetup(
      requireAuthenticated(request),
      body.password,
      readClientIp(request),
    );

    writeSecret(response);

    return started;
  }

  /** Confirme l'inscription par un premier code, et rend les codes de secours. */
  @Post('two-factor/activate')
  @HttpCode(HttpStatus.OK)
  async activateTwoFactor(
    @Body(new ZodValidationPipe(twoFactorConfirmSchema)) body: TwoFactorConfirmInput,
    @Req() request: unknown,
    @Res({ passthrough: true }) response: CookieSink,
  ): Promise<BackupCodesResponse> {
    const codes = await this.auth.activateTwoFactor(
      requireAuthenticated(request),
      body.password,
      body.code,
      readClientIp(request),
    );

    writeSecret(response);

    // Montrés une seule fois : ils ne sont stockés que hachés.
    return backupCodesResponseSchema.parse({ codes: codes.map((code) => code.display) });
  }

  /**
   * Ouvre les droits d'administration d'une session déjà ouverte.
   *
   * C'est le chemin d'une session reprise par le cookie de mémorisation, qui
   * vaut pour l'application mais pas pour l'administration.
   */
  @Post('two-factor/unlock')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlockTwoFactor(
    @Body(new ZodValidationPipe(twoFactorCodeSchema)) body: TwoFactorCodeInput,
    @Req() request: unknown,
  ): Promise<void> {
    await this.auth.unlockAdmin(requireAuthenticated(request), body.code, readClientIp(request));
  }

  /**
   * La désactivation : mot de passe et code, parce que c'est aussi le chemin du
   * téléphone perdu.
   *
   * `POST .../disable` et non `DELETE /auth/two-factor` : la requête porte un
   * corps, et un corps sur DELETE, bien que légal, est jeté par nombre de
   * mandataires. Le mandataire du homelab n'est pas dans ce dépôt (issue #31),
   * donc autant ne pas en dépendre.
   */
  @Post('two-factor/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTwoFactor(
    @Body(new ZodValidationPipe(twoFactorConfirmSchema)) body: TwoFactorConfirmInput,
    @Req() request: unknown,
  ): Promise<void> {
    await this.auth.disableTwoFactor(
      requireAuthenticated(request),
      body.password,
      body.code,
      readClientIp(request),
    );
  }
}
