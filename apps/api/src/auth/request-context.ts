import type { RequestOrigin } from '../security/origin.js';
import { readCookie } from '../security/cookies.js';

import type { Authenticated } from './session.service.js';

/*
  Ce que l'API lit d'une requête HTTP.

  Les types d'Express ne sont pas installés (seul @types/pg l'est), et le projet
  ne les ajoute pas pour si peu : la requête arrive donc en `unknown` et sort
  par des gardes de type, comme dans le filtre d'exceptions. C'est aussi ce qui
  rend ces fonctions testables sans serveur, avec un objet littéral.
*/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStringProperty(request: unknown, key: string): string | undefined {
  if (isRecord(request)) {
    const value = request[key];

    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

/**
 * Un en-tête de la requête.
 *
 * Un en-tête reçu deux fois arrive en tableau : il est alors ignoré plutôt que
 * replié. Aucun des en-têtes lus ici ne se répète légitimement, et en choisir
 * un des deux serait une décision prise à l'aveugle sur le chemin du CSRF.
 */
export function readHeader(request: unknown, name: string): string | undefined {
  if (isRecord(request)) {
    const headers = request['headers'];

    if (isRecord(headers)) {
      const value = headers[name];

      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return undefined;
}

export function readMethod(request: unknown): string {
  return readStringProperty(request, 'method') ?? '';
}

/**
 * Le chemin demandé, sans chaîne de requête et sans barre oblique finale.
 *
 * Express ne distingue pas `/auth/login` de `/auth/login/` : les deux atteignent
 * le même gestionnaire. La liste des routes exemptées de CSRF doit donc les
 * voir pareil, sinon une barre en trop suffirait à la contourner.
 */
export function readPath(request: unknown): string {
  const path = readStringProperty(request, 'path') ?? '';

  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function readRequestCookie(request: unknown, name: string): string | undefined {
  return readCookie(readHeader(request, 'cookie'), name);
}

/**
 * De quoi comparer l'origine de la requête à celle de l'application.
 *
 * `protocol` et `host` sont des propriétés calculées par Express : derrière un
 * mandataire de confiance, elles suivent `X-Forwarded-Proto` et
 * `X-Forwarded-Host`, donc l'origine publique, celle que le navigateur a mise
 * dans `Origin`. C'est tout l'intérêt du réglage `trust proxy` de main.ts.
 */
export function readOrigin(request: unknown): RequestOrigin {
  return {
    origin: readHeader(request, 'origin'),
    secFetchSite: readHeader(request, 'sec-fetch-site'),
    protocol: readStringProperty(request, 'protocol') ?? '',
    host: readStringProperty(request, 'host'),
  };
}

/**
 * L'adresse IP du client, telle que la limitation la compte.
 *
 * `request.ip` respecte `trust proxy` : c'est l'adresse réelle derrière le
 * mandataire du homelab, et l'adresse du mandataire si personne ne lui a donné
 * sa confiance. Une requête sans adresse (socket déjà fermée) est comptée sous
 * une clé commune plutôt que de passer sans limite.
 */
export function readClientIp(request: unknown): string {
  return readStringProperty(request, 'ip') ?? 'inconnue';
}

/*
  La session résolue, rangée dans une table faible plutôt que posée sur l'objet
  de la requête.

  Deux raisons : rien n'est ajouté à un objet qui ne nous appartient pas, et
  aucune déclaration de module n'est nécessaire pour que ce soit typé. L'entrée
  disparaît avec la requête.
*/
const sessions = new WeakMap<object, Authenticated>();

export function attachAuthenticated(request: unknown, value: Authenticated): void {
  if (!isRecord(request)) {
    throw new Error("la requête n'est pas un objet : session impossible à attacher");
  }

  sessions.set(request, value);
}

export function readAuthenticated(request: unknown): Authenticated | undefined {
  return isRecord(request) ? sessions.get(request) : undefined;
}

/**
 * La session, qui est forcément là derrière la garde d'authentification.
 *
 * Son absence est un défaut de branchement, pas un refus d'accès : elle remonte
 * donc en erreur inattendue (500 générique et journal), et non en 401.
 */
export function requireAuthenticated(request: unknown): Authenticated {
  const authenticated = readAuthenticated(request);

  if (authenticated === undefined) {
    throw new Error('route protégée atteinte sans session résolue');
  }

  return authenticated;
}
