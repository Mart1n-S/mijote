import { randomUUID } from 'node:crypto';

import { PROBLEM_DETAILS_MEDIA_TYPE, REQUEST_ID_HEADER, type ProblemDetails } from '@mijote/shared';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PinoLogger } from 'nestjs-pino';

import { ProblemException } from './problem.exception.js';
import { ValidationException } from './validation.exception.js';

/*
  Toutes les réponses d'erreur de l'API passent par ici, et par rien d'autre :
  c'est ce qui rend le format unique (RFC 9457, voir api.md). Le filtre est posé
  en APP_FILTER dans AppModule, donc il attrape aussi ce que NestJS lève de
  lui-même, la route inconnue et le corps illisible en premier.
*/

/** Intitulés en français, par statut. Le front n'a pas à les traduire. */
const TITLES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Requête invalide',
  [HttpStatus.UNAUTHORIZED]: 'Authentification requise',
  [HttpStatus.FORBIDDEN]: 'Accès refusé',
  [HttpStatus.NOT_FOUND]: 'Ressource introuvable',
  [HttpStatus.CONFLICT]: 'Conflit',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Contenu trop volumineux',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'Type de média non supporté',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Requête invalide',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Trop de requêtes',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Erreur interne',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service indisponible',
};

const FALLBACK_TITLE = 'Erreur';

/*
  Ce que voit le navigateur sur une erreur inattendue. Ni message d'origine, ni
  trace, ni requête SQL, ni chemin de fichier : seul l'identifiant de requête
  sort, et il ne dit rien par lui-même. Le détail vit dans les journaux, où il
  se retrouve par cet identifiant.
*/
const UNEXPECTED_DETAIL =
  "Une erreur inattendue s'est produite. L'identifiant de requête permet de la retrouver dans les journaux.";

/*
  Détails servis quand l'exception ne vient pas du projet : voir
  ProblemException pour ce que les messages de NestJS laisseraient sortir.
*/
const DETAILS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "La requête n'a pas pu être lue.",
  [HttpStatus.UNAUTHORIZED]: 'Cette action demande une authentification.',
  [HttpStatus.FORBIDDEN]: "Cette action n'est pas autorisée.",
  [HttpStatus.NOT_FOUND]: "Cette adresse n'existe pas.",
  [HttpStatus.CONFLICT]: "La demande entre en conflit avec l'état actuel.",
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Le contenu envoyé est trop volumineux.',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: "Le type de média envoyé n'est pas accepté.",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "La requête n'a pas pu être traitée.",
  [HttpStatus.TOO_MANY_REQUESTS]: 'Trop de requêtes ont été envoyées. Réessayez dans un instant.',
  [HttpStatus.INTERNAL_SERVER_ERROR]: UNEXPECTED_DETAIL,
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Le service est momentanément indisponible.',
};

const FALLBACK_DETAIL = "La demande n'a pas pu être traitée.";

/*
  500 et au-delà. Le seuil vient de l'énumération de NestJS, mais il est typé
  `number` : comparer une énumération à un statut quelconque n'a pas de sens
  pour le lint typé, qui le refuse à juste titre.
*/
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** L'identifiant posé sur la requête par la journalisation, s'il y est. */
function readRequestId(request: unknown): string | undefined {
  if (isRecord(request)) {
    const id = request['id'];

    if (typeof id === 'string') {
      return id;
    }
  }

  return undefined;
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
      Attendue ou inattendue, c'est la première distinction. Une exception HTTP
      a été levée exprès, par le code ou par NestJS, et son statut est le bon.
      Tout le reste est un défaut : 500, et le message d'origine ne sort pas.
    */
    const known = exception instanceof HttpException;
    const status = known ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    /*
      La seconde distinction porte sur le message. Seules les exceptions du
      projet écrivent le leur pour être lues ; celui de NestJS reste au journal.
    */
    const detail =
      exception instanceof ProblemException
        ? exception.message
        : (DETAILS[status] ?? FALLBACK_DETAIL);

    /*
      Une requête sans identifiant n'est pas passée par l'intergiciel de
      journalisation : c'est le cas d'un corps illisible, refusé par l'analyseur
      d'Express avant lui. Mesuré le 1er novembre 2026, une telle requête ne
      produisait aucune ligne de journal et repartait sans en-tête. On lui
      engendre donc son identifiant, on le lui pose, et on écrit la seule ligne
      qu'elle produira.
    */
    const tracked = readRequestId(request);
    const requestId = tracked ?? randomUUID();

    if (tracked === undefined) {
      httpAdapter.setHeader(response, REQUEST_ID_HEADER, requestId);
      this.logger.warn({ requestId, err: exception }, 'requête rejetée avant la journalisation');
    }

    if (!known) {
      // La trace ne part qu'ici, avec l'identifiant de requête que la
      // journalisation ajoute d'elle-même à la ligne.
      this.logger.error({ err: exception }, 'erreur inattendue');
    } else if (status >= SERVER_ERROR_FLOOR && tracked !== undefined) {
      this.logger.warn({ err: exception }, 'erreur de service');
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: TITLES[status] ?? FALLBACK_TITLE,
      status,
      detail,
      requestId,
      ...(exception instanceof ValidationException
        ? { errors: [...exception.fieldErrors] }
        : undefined),
    };

    httpAdapter.setHeader(response, 'Content-Type', PROBLEM_DETAILS_MEDIA_TYPE);
    httpAdapter.reply(response, problem, status);
  }
}
