import {
  CSRF_COOKIE,
  CSRF_HEADER,
  PROBLEM_DETAILS_MEDIA_TYPE,
  problemDetailsSchema,
  type ProblemDetails,
} from '@mijote/shared';

/*
  Le seul point d'entrée du front vers l'API. Tout appel passe par ici, pour que
  la lecture du format d'erreur (RFC 9457) et le message montré à l'utilisateur
  soient écrits une fois.

  L'API est servie sous /api par le même hôte que la PWA : en développement par
  le mandataire de vite.config.ts, en production par le serveur frontal du
  homelab. Il n'y a donc pas d'adresse d'API côté navigateur, et pas de requête
  entre origines, donc pas de CORS à ouvrir (les en-têtes de sécurité sont
  l'issue #31).
*/
const API_PREFIX = '/api';

/** Au-delà, on considère que le service ne répond pas. */
const TIMEOUT_MS = 5_000;

/** Ces méthodes ne modifient rien : elles n'ont rien à prouver au serveur. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Le jeton CSRF, que le serveur a posé dans le seul cookie lisible.
 *
 * Le renvoyer en en-tête est ce qui prouve au serveur que la requête vient
 * d'une page de cette origine : une page d'un autre site ne peut ni lire ce
 * cookie, ni écrire cet en-tête (voir l'ADR 0010).
 */
function readCsrfToken(): string | undefined {
  for (const pair of document.cookie.split(';')) {
    const separator = pair.indexOf('=');

    if (separator > 0 && pair.slice(0, separator).trim() === CSRF_COOKIE) {
      const value = pair.slice(separator + 1).trim();

      return value === '' ? undefined : value;
    }
  }

  return undefined;
}

/**
 * Les en-têtes d'une requête qui modifie l'état : le jeton CSRF, et le type de
 * média que l'API exige.
 *
 * Le type JSON est posé ici plutôt qu'à chaque appel, parce que c'est une
 * barrière de sécurité et non un détail de requête : l'API refuse en 415 tout
 * ce qui n'est pas du JSON, justement parce qu'un formulaire d'un autre site ne
 * peut pas déclarer ce type.
 */
function writeHeaders(init: RequestInit | undefined): HeadersInit {
  const headers = new Headers(init?.headers);
  const token = readCsrfToken();

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (token !== undefined) {
    headers.set(CSRF_HEADER, token);
  }

  return headers;
}

function buildUserMessage(status: number | undefined, problem: ProblemDetails | undefined): string {
  if (status === undefined) {
    return 'Le service est injoignable. Vérifiez votre connexion, puis réessayez.';
  }

  /*
    Au-delà de 500, le détail du serveur n'est pas montré, même s'il en donne
    un : une erreur inattendue peut venir d'un intermédiaire dont le texte n'est
    ni en français ni destiné à un utilisateur.
  */
  if (status >= 500) {
    return 'Le service est momentanément indisponible. Réessayez dans un instant.';
  }

  const fieldErrors = problem?.errors;

  if (fieldErrors !== undefined && fieldErrors.length > 0) {
    return `La demande contient des erreurs : ${fieldErrors.map((item) => item.message).join(' ')}`;
  }

  // En deçà de 500, le détail vient de notre API, qui l'écrit en français.
  return problem?.detail ?? "La demande n'a pas pu être traitée.";
}

/**
 * Un appel d'API qui a échoué, que ce soit le réseau, le service ou la requête.
 *
 * `message` sert au développeur et aux journaux ; `userMessage` est la phrase
 * à montrer, en français.
 */
export class ApiError extends Error {
  readonly userMessage: string;

  constructor(
    readonly status: number | undefined,
    readonly problem: ProblemDetails | undefined,
    options?: ErrorOptions,
  ) {
    super(
      `appel API en échec (statut ${status?.toString() ?? 'absent'}, requête ${problem?.requestId ?? 'inconnue'})`,
      options,
    );

    this.name = 'ApiError';
    this.userMessage = buildUserMessage(status, problem);
  }
}

/** Le problème RFC 9457 du corps, s'il y en a un de lisible. */
async function readProblem(response: Response): Promise<ProblemDetails | undefined> {
  if (!(response.headers.get('content-type') ?? '').includes(PROBLEM_DETAILS_MEDIA_TYPE)) {
    return undefined;
  }

  try {
    const parsed = problemDetailsSchema.safeParse(await response.json());

    return parsed.success ? parsed.data : undefined;
  } catch {
    /*
      Un corps annoncé problem+json mais tronqué ou vide. Il n'y a rien à
      journaliser de plus que le statut, que l'appelant a déjà, et rien à
      relancer : l'erreur rendue reste celle du statut.
    */
    return undefined;
  }
}

/**
 * Appelle l'API et rend la réponse si elle a abouti.
 *
 * Lève une `ApiError` sur un statut d'erreur, une panne de réseau ou un
 * dépassement de délai. L'appelant lit le corps lui-même, et le valide.
 */
export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;

  const method = (init?.method ?? 'GET').toUpperCase();

  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      ...(SAFE_METHODS.has(method) ? undefined : { headers: writeHeaders(init) }),
      signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Réseau coupé, service arrêté, délai dépassé : aucun statut, donc aucune
    // information à donner de plus que « injoignable ». La cause est chaînée :
    // elle seule distingue un délai dépassé d'un réseau coupé en console.
    throw new ApiError(undefined, undefined, { cause: error });
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readProblem(response));
  }

  return response;
}
