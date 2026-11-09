import { CSRF_HEADER } from '@mijote/shared';
import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';

import { ProblemException } from '../errors/problem.exception.js';
import { isSameOrigin } from '../security/origin.js';
import { hashesMatch } from '../security/tokens.js';

import { readCsrfSecret, readHeader, readMethod, readOrigin, readPath } from './request-context.js';

/*
  La protection CSRF, en trois barrières (ADR 0010).

  1. Le type de média : toute requête qui modifie l'état doit être du JSON. Un
     formulaire d'un autre site ne peut envoyer que trois types, dont aucun
     n'est `application/json` ; et une requête `fetch` qui le déclarerait
     demanderait d'abord la permission par une requête préalable, à laquelle
     l'API ne répond pas, faute de CORS ouvert.
  2. L'origine : `Origin` est écrit par le navigateur, une page ne peut pas le
     choisir. Elle se compare entière, schéma, hôte et port.
  3. Le jeton : le cookie lisible porte le secret CSRF de la session, et le
     front le renvoie en en-tête. Une page d'un autre site ne peut lire ni
     l'un ni écrire l'autre.

  La première ne tient **que** parce qu'aucun CORS n'est ouvert sur cette API :
  une origine autorisée, avec `content-type` dans sa liste permise, ferait
  approuver la requête préalable, et un autre site pourrait alors envoyer du
  JSON. Les deux autres ne dépendent pas du CORS : l'origine est comparée à
  celle de la requête reçue, sans consulter aucune liste permise, et le cookie
  du jeton n'est lisible que par une page de cette origine.

  À noter, parce que c'est contre-intuitif : l'absence de CORS n'empêche pas
  une requête d'arriver, elle empêche l'autre site de **lire la réponse**. Une
  requête simple en `text/plain` est donc bien reçue et exécutée, d'où l'ordre
  ci-dessous. Voir l'ADR 0010, et la condition à relire en traitant l'issue
  #31.
*/

/** Ces méthodes ne modifient rien : elles passent sans jeton. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const JSON_MEDIA_TYPE = 'application/json';

/*
  Les routes dispensées de l'en-tête CSRF, et elles seules.

  La connexion y est forcée : la session n'existe pas encore, donc il n'y a
  aucun secret à renvoyer. Elle garde les deux premières barrières, et la
  limitation des tentatives par-dessus.

  Cette liste est la plus courte possible, et un test l'énumère : elle ne
  s'allonge pas sans que quelqu'un s'en aperçoive.
*/
export const CSRF_EXEMPT_ROUTES: readonly { method: string; path: string }[] = [
  { method: 'POST', path: '/auth/login' },
  /*
    Les deux routes d'une invitation, pour la même raison : aucune session
    n'existe encore, donc aucun secret CSRF à renvoyer. Le pouvoir vient du
    jeton que le corps porte, et non d'un cookie, donc il n'y a rien à
    détourner.

    Elles gardent les deux autres barrières, et c'est nécessaire : l'acceptation
    ouvre une session, donc un site tiers pourrait sinon connecter une victime à
    un compte qu'il contrôle (ADR 0013).
  */
  { method: 'POST', path: '/invitations/preview' },
  { method: 'POST', path: '/invitations/accept' },
  /*
    La demande de réinitialisation, pour la même raison : elle est appelée par
    quelqu'un qui ne peut pas se connecter, donc sans session, donc sans secret
    CSRF à renvoyer.

    Elle garde les deux autres barrières : elle fait partir un e-mail, et une
    page d'un autre site n'a rien à faire là (ADR 0014).
  */
  { method: 'POST', path: '/auth/password/forgot' },
];

const WRONG_MEDIA_TYPE = 'Le type de média doit être application/json.';
const WRONG_ORIGIN = "Cette requête ne vient pas de l'application.";
const MISSING_TOKEN = 'Jeton de protection manquant ou invalide.';

/** L'en-tête, en minuscules : Node normalise les noms d'en-têtes reçus. */
const CSRF_HEADER_NAME = CSRF_HEADER.toLowerCase();

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<unknown>();

    if (SAFE_METHODS.has(readMethod(request).toUpperCase())) {
      return true;
    }

    /*
      Le type de média est contrôlé avant l'origine, et c'est voulu : c'est la
      barrière qui tient sans aucun en-tête de navigateur, et un `text/plain`
      dont le corps serait du JSON valide doit être refusé pour ce qu'il est.
    */
    if (!readHeader(request, 'content-type')?.toLowerCase().startsWith(JSON_MEDIA_TYPE)) {
      throw new ProblemException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, WRONG_MEDIA_TYPE);
    }

    if (!isSameOrigin(readOrigin(request))) {
      throw new ProblemException(HttpStatus.FORBIDDEN, WRONG_ORIGIN);
    }

    if (isExempt(request)) {
      return true;
    }

    /*
      Le secret de la session, ou celui de l'attente de code : les deux portent
      le leur, et la garde de session n'en attache jamais qu'un. C'est ce qui
      permet à la soumission du code de garder cette barrière, au lieu de
      s'ajouter à la liste des routes exemptées.
    */
    const expected = readCsrfSecret(request);
    const presented = readHeader(request, CSRF_HEADER_NAME);

    /*
      Pas de session, pas de jeton attendu, donc pas de passage : une route qui
      modifie l'état sans session ne peut être que la connexion, et elle est
      dans la liste ci-dessus.
    */
    if (expected === undefined || presented === undefined || !hashesMatch(expected, presented)) {
      throw new ProblemException(HttpStatus.FORBIDDEN, MISSING_TOKEN);
    }

    return true;
  }
}

function isExempt(request: unknown): boolean {
  const method = readMethod(request).toUpperCase();
  const path = readPath(request);

  return CSRF_EXEMPT_ROUTES.some((route) => route.method === method && route.path === path);
}
