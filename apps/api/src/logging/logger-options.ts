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
  L'erreur de requête de Drizzle, reconnue à sa forme.

  Elle porte la requête **et ses paramètres** dans son message, donc dans la
  première ligne de sa pile, et dans une propriété `params`. Depuis la story
  #10, ces paramètres sont des adresses e-mail : c'est la « première requête qui
  en portera » qu'annonçait le commentaire ci-dessus, et il faut donc la traiter
  à part.

  Reconnue par sa forme et non par `instanceof` : la classe n'est pas exportée
  par la racine de drizzle-orm, et le module de journalisation n'a pas à
  dépendre de l'ORM pour savoir se taire.
*/
interface QueryError {
  query: string;
  params: unknown;
}

function isQueryError(error: Error): error is Error & QueryError {
  return 'query' in error && typeof error.query === 'string' && 'params' in error;
}

/** Ce que Drizzle écrit à la place du message, les paramètres retirés. */
const QUERY_FAILED = 'requête SQL en échec';

/**
 * La pile sans sa première ligne.
 *
 * V8 commence une pile par le message de l'erreur : garder la pile telle quelle
 * remettrait les paramètres que le message vient de perdre. Seules les lignes
 * d'appel sont gardées, et elles suffisent à situer la requête.
 */
function callFrames(stack: string | undefined): string | undefined {
  const frames = (stack ?? '')
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n');

  return frames === '' ? undefined : frames;
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

  Le cas d'une requête en échec est traité à part, parce que Drizzle place ses
  paramètres dans le message : mesuré le 7 novembre 2026 contre la base de
  développement, `select 1 from table_inexistante where email = $1` lève une
  erreur dont le message, la pile et la propriété `params` portent l'adresse
  soumise. Sont donc gardées la requête, qui est paramétrée et ne porte aucune
  valeur, le code de PostgreSQL, et les lignes d'appel de la pile.

  Le message de la cause, lui, est gardé : PostgreSQL y nomme la contrainte ou
  la table, jamais la valeur. C'est son champ `detail` qui dirait « Key
  (email)=(...) already exists », et la liste blanche ne le laisse pas passer.
*/
function serializeError(value: unknown): Record<string, unknown> {
  if (!(value instanceof Error)) {
    return { type: typeof value, message: String(value) };
  }

  const fields = isQueryError(value)
    ? {
        type: value.name,
        message: QUERY_FAILED,
        code: readErrorCode(value),
        stack: callFrames(value.stack),
        query: value.query,
      }
    : errorFields(value);

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
