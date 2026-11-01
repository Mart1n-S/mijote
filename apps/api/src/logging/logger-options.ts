import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { REQUEST_ID_HEADER } from '@mijote/shared';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';

/*
  Options de journalisation, sorties du module NestJS exprès : elles sont le
  coeur de ce que la story #8 garantit (identifiant de requête, liste blanche,
  masquage), et une option passée dans un décorateur ne se teste pas.
*/

// `silent` coupe tout : il ne sert qu'aux tests, qui montent l'application
// entière et n'ont pas à écrire une ligne de journal par requête.
const LOG_LEVELS = ['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

type LogLevel = (typeof LOG_LEVELS)[number];

/** Les variables d'environnement qui règlent la journalisation. */
export interface LoggingEnvironment {
  NODE_ENV?: string | undefined;
  LOG_LEVEL?: string | undefined;
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.some((level) => level === value);
}

/**
 * Niveau de journalisation : `LOG_LEVEL` si elle est donnée, sinon `debug` en
 * développement et `info` ailleurs.
 *
 * Une valeur inconnue fait échouer le démarrage, comme `drizzle.config.ts` le
 * fait pour `DATABASE_URL` : un niveau mal orthographié passerait pour un
 * réglage appliqué, et c'est justement quand on cherche quelque chose qu'on y
 * touche.
 */
export function resolveLogLevel(env: LoggingEnvironment): LogLevel {
  const production = env.NODE_ENV === 'production';
  const asked = env.LOG_LEVEL?.trim().toLowerCase();

  if (asked === undefined || asked === '') {
    return production ? 'info' : 'debug';
  }

  if (!isLogLevel(asked)) {
    throw new Error(
      `LOG_LEVEL vaut "${asked}", qui n'est pas un niveau pino. Valeurs acceptées : ${LOG_LEVELS.join(', ')}. Voir .env.example.`,
    );
  }

  /*
    debug et trace sont coupés en production (section 8 du cahier des charges).
    Le niveau demandé est ramené à info plutôt que refusé : la variable peut
    venir de l'orchestrateur, et une API qui refuse de démarrer pour un niveau
    trop bavard serait un remède pire que le mal.
  */
  if (production && (asked === 'debug' || asked === 'trace')) {
    return 'info';
  }

  return asked;
}

/** Le chemin seul, sans la chaîne de requête. */
function pathOf(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}

/*
  Liste blanche, et non masquage de ce qui gêne : c'est ce que demande
  security.md, et c'est le seul sens qui tienne quand on ne sait pas d'avance ce
  qu'une requête portera.

  Le chemin est journalisé sans sa chaîne de requête. Ce n'est pas une
  précaution de principe : l'adresse saisie pour trouver un magasin ne doit être
  ni stockée ni journalisée (security.md), et elle arrivera en paramètre de
  requête. Les en-têtes, l'adresse IP et le corps ne sortent pas du tout.
*/
function serializeRequest(request: IncomingMessage & { id?: unknown }): Record<string, unknown> {
  return {
    id: typeof request.id === 'string' ? request.id : undefined,
    method: request.method,
    route: pathOf(request.url),
  };
}

function serializeResponse(response: ServerResponse): Record<string, unknown> {
  return { statusCode: response.statusCode };
}

/** Le code d'erreur quand il y en a un, sans supposer qu'il existe. */
function readErrorCode(error: Error): string | undefined {
  if (!('code' in error)) {
    return undefined;
  }

  const { code } = error;

  return typeof code === 'string' ? code : undefined;
}

function errorFields(error: Error): Record<string, unknown> {
  return {
    type: error.name,
    message: error.message,
    code: readErrorCode(error),
    stack: error.stack,
  };
}

/*
  Liste blanche pour les erreurs aussi, et pas seulement pour les requêtes.

  Le sérialiseur par défaut de pino recopie toutes les propriétés énumérables de
  l'erreur. Or une erreur de PostgreSQL en porte beaucoup : `detail` (« Key
  (email)=(...) already exists »), `where`, `internalQuery`, `table`,
  `constraint`. Et une erreur de client inactif du pool porte `client`, donc
  tout l'objet de connexion. Rien de cela n'a à entrer dans un journal.

  La cause est gardée, sur un seul niveau : c'est elle qui dit pourquoi, et elle
  passe par le même tamis.

  Limite connue, mesurée : Drizzle place la requête et ses paramètres dans le
  message de ses erreurs. Tant que le seul SQL du projet est `select 1`, ce
  message ne porte rien de personnel. À la première requête qui en portera, il
  ne faudra pas journaliser l'erreur entière mais son `code`.
*/
function serializeError(value: unknown): Record<string, unknown> {
  if (!(value instanceof Error)) {
    return { type: typeof value, message: String(value) };
  }

  const fields = errorFields(value);

  return value.cause instanceof Error ? { ...fields, cause: errorFields(value.cause) } : fields;
}

/**
 * Les options de pino-http, à part du module NestJS.
 *
 * Le type de `Params.pinoHttp` est une union (options, flux de sortie, ou les
 * deux en couple) : une fonction qui en rend une forme précise est ce qui
 * permet de la mesurer dans un test, sans deviner laquelle est là.
 */
export function buildPinoHttpOptions(env: LoggingEnvironment): Options {
  return {
    level: resolveLogLevel(env),
    /*
      L'identifiant est toujours engendré ici, et un `X-Request-Id` reçu du
      client est ignoré : une entrée externe ne se recopie pas dans les
      journaux (security.md), où elle servirait à les polluer ou à se faire
      passer pour la trace d'une autre requête.

      L'en-tête de réponse est posé au passage, parce que c'est le seul moment
      où l'identifiant et la réponse sont tous deux sous la main.

      Le jour où le serveur frontal du homelab posera le sien, il faudra
      l'accepter pour que ses journaux et ceux de l'API se recoupent, mais
      seulement s'il vient de ce mandataire et qu'il a bien la forme d'un UUID.
      Rien ne l'envoie aujourd'hui.
    */
    genReqId: (_request, response): string => {
      const id = randomUUID();

      response.setHeader(REQUEST_ID_HEADER, id);

      return id;
    },
    serializers: { req: serializeRequest, res: serializeResponse, err: serializeError },
    /*
      Filet, pas garantie : la règle reste de ne pas journaliser ces valeurs, et
      ce sont les sérialiseurs ci-dessus qui tiennent vraiment les en-têtes, le
      corps et les erreurs hors des journaux.

      Ce filet ne vise donc que ce qu'un appel maladroit passerait directement :
      les chemins sans étoile valent pour la racine de l'objet journalisé, ceux
      avec étoile pour un seul niveau en dessous. Plus profond, ou dans un
      tableau, il ne voit rien. Ce qu'il attrape est mesuré dans
      logger-options.spec.ts.

      Les chemins d'en-têtes ont été retirés le 1er novembre 2026 : pino
      applique les sérialiseurs avant le masquage, donc `req.headers` n'existait
      plus au moment où ces chemins étaient évalués, et ils ne protégeaient
      rien.
    */
    redact: {
      paths: ['password', 'token', 'email', '*.password', '*.token', '*.email'],
      censor: '[masqué]',
    },
    // Une ligne par requête terminée : méthode, route, statut, durée,
    // identifiant. C'est la ligne d'accès que demande l'issue.
    autoLogging: true,
  };
}

/** Les options telles que nestjs-pino les attend. */
export function buildLoggerParams(env: LoggingEnvironment): Params {
  return { pinoHttp: buildPinoHttpOptions(env) };
}
