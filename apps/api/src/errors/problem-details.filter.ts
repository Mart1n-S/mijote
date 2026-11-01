import { PROBLEM_DETAILS_MEDIA_TYPE, type ProblemDetails } from '@mijote/shared';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

import { ValidationException } from './validation.exception.js';

/*
  Toutes les réponses d'erreur de l'API passent par ici, et par rien d'autre :
  c'est ce qui rend le format unique (RFC 9457, voir api.md). Le filtre est posé
  en APP_FILTER dans AppModule, donc il attrape aussi ce que NestJS lève de
  lui-même, la route inconnue en premier.
*/

/** Intitulés en français, par statut. Le front n'a pas à les traduire. */
const TITLES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Requête invalide',
  [HttpStatus.UNAUTHORIZED]: 'Authentification requise',
  [HttpStatus.FORBIDDEN]: 'Accès refusé',
  [HttpStatus.NOT_FOUND]: 'Ressource introuvable',
  [HttpStatus.CONFLICT]: 'Conflit',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Contenu trop volumineux',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Requête invalide',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Trop de requêtes',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Erreur interne',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service indisponible',
};

const FALLBACK_TITLE = 'Erreur';

/*
  500 et au-delà. Le seuil vient de l'énumération de NestJS, mais il est typé
  `number` : comparer une énumération à un statut quelconque n'a pas de sens
  pour le lint typé, qui le refuse à juste titre.
*/
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

/*
  Ce que voit le navigateur sur une erreur inattendue. Ni message d'origine, ni
  trace, ni requête SQL, ni chemin de fichier : seul l'identifiant de requête
  sort, et il ne dit rien par lui-même. Le détail vit dans les journaux, où il
  se retrouve par cet identifiant.
*/
const UNEXPECTED_DETAIL =
  "Une erreur inattendue s'est produite. L'identifiant de requête permet de la retrouver dans les journaux.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** L'identifiant posé sur la requête par la journalisation. */
function readRequestId(request: unknown): string {
  if (isRecord(request)) {
    const id = request['id'];

    if (typeof id === 'string') {
      return id;
    }
  }

  return '';
}

/**
 * Le message d'une exception HTTP, telle que NestJS la remplit : une chaîne,
 * ou un objet dont `message` est une chaîne ou une liste de chaînes.
 */
function readDetail(exception: HttpException): string {
  const response: unknown = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  if (isRecord(response)) {
    const message = response['message'];

    if (typeof message === 'string') {
      return message;
    }

    if (Array.isArray(message)) {
      const parts = message.filter((part): part is string => typeof part === 'string');

      if (parts.length > 0) {
        return parts.join(' ');
      }
    }
  }

  return exception.message;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly logger: PinoLogger,
  ) {
    // PinoLogger est transitoire : ce contexte n'est posé que sur l'instance
    // du filtre.
    this.logger.setContext(ProblemDetailsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    // L'adaptateur est résolu ici et non dans le constructeur : il peut ne pas
    // être prêt à ce moment-là (documentation NestJS).
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<unknown>();
    const response = context.getResponse<unknown>();

    /*
      Attendue ou inattendue, c'est la seule distinction qui compte ici. Une
      exception HTTP a été levée exprès, par le code ou par NestJS, et son
      message est fait pour sortir. Tout le reste est un défaut : le message
      d'origine ne part pas au navigateur.
    */
    const known = exception instanceof HttpException;
    const status = known ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (known) {
      if (status >= SERVER_ERROR_FLOOR) {
        this.logger.warn({ err: exception }, 'erreur de service');
      }
    } else {
      // La trace ne part qu'ici, avec l'identifiant de requête que la
      // journalisation ajoute d'elle-même à la ligne.
      this.logger.error({ err: exception }, 'erreur inattendue');
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? FALLBACK_TITLE,
      status,
      detail: known ? readDetail(exception) : UNEXPECTED_DETAIL,
      requestId: readRequestId(request),
      ...(exception instanceof ValidationException
        ? { errors: [...exception.fieldErrors] }
        : undefined),
    };

    httpAdapter.setHeader(response, 'Content-Type', PROBLEM_DETAILS_MEDIA_TYPE);
    httpAdapter.reply(response, problem, status);
  }
}
