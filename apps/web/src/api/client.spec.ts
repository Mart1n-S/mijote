// @vitest-environment jsdom
// L'environnement jsdom pour document.cookie : c'est là que le serveur pose le
// jeton CSRF, et le client doit le renvoyer en en-tête.

import { CSRF_HEADER, PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest } from './client';

/*
  Le client est mesuré avec un fetch bouchonné : ce qui compte ici est ce qu'il
  fait d'une réponse, pas qu'un serveur réponde. Le parcours complet, de l'API
  réelle au bandeau, est couvert par e2e/service-status.spec.ts.
*/

function respondWith(body: string, init: ResponseInit & { contentType?: string }): void {
  const headers = new Headers(init.headers);

  if (init.contentType !== undefined) {
    headers.set('content-type', init.contentType);
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { ...init, headers }))),
  );
}

function problemBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'about:blank',
    title: 'Service indisponible',
    status: 503,
    detail: 'Le service est momentanément indisponible.',
    requestId: 'ab12',
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'mijote_csrf=; Max-Age=0';
});

/*
  Les options passées à fetch sont capturées par le bouchon lui-même : les
  relire dans le registre de vitest les rendrait de type incertain, et il
  faudrait une assertion de type pour les en sortir.
*/
let sent: RequestInit | undefined;

function captureRequest(): void {
  sent = undefined;

  vi.stubGlobal(
    'fetch',
    vi.fn((_path: unknown, init?: RequestInit) => {
      sent = init;

      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    }),
  );
}

function sentHeaders(): Headers {
  return new Headers(sent?.headers);
}

describe('apiRequest', () => {
  it("préfixe l'appel par /api, sur la même origine", async () => {
    respondWith('{"status":"ok"}', { status: 200, contentType: 'application/json' });

    await apiRequest('/health');

    expect(fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({}));
  });

  it('rend la réponse quand elle aboutit', async () => {
    respondWith('{"status":"ok"}', { status: 200, contentType: 'application/json' });

    const response = await apiRequest('/health');

    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('lit le problème RFC 9457 et garde son identifiant de requête', async () => {
    respondWith(problemBody(), { status: 503, contentType: PROBLEM_DETAILS_MEDIA_TYPE });

    await expect(apiRequest('/health')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      expect(error instanceof ApiError ? error.status : undefined).toBe(503);
      expect(error instanceof ApiError ? error.problem?.requestId : undefined).toBe('ab12');

      return true;
    });
  });

  it('montre un message générique au-delà de 500, sans recopier le serveur', async () => {
    respondWith(problemBody({ detail: 'Internal failure in upstream pool' }), {
      status: 502,
      contentType: PROBLEM_DETAILS_MEDIA_TYPE,
    });

    try {
      await apiRequest('/health');
      expect.unreachable('la requête devait échouer');
    } catch (error) {
      const message = error instanceof ApiError ? error.userMessage : '';

      expect(message).toContain('momentanément indisponible');
      expect(message).not.toContain('upstream');
    }
  });

  it('montre les messages de champs sur une erreur de validation', async () => {
    respondWith(
      problemBody({
        status: 400,
        title: 'Requête invalide',
        detail: 'La requête contient des champs invalides.',
        errors: [{ field: 'size', message: 'Doit être un nombre positif.' }],
      }),
      { status: 400, contentType: PROBLEM_DETAILS_MEDIA_TYPE },
    );

    try {
      await apiRequest('/households', { method: 'POST' });
      expect.unreachable('la requête devait échouer');
    } catch (error) {
      expect(error instanceof ApiError ? error.userMessage : '').toContain(
        'Doit être un nombre positif.',
      );
    }
  });

  it("se contente du statut quand le corps n'est pas un problème", async () => {
    // Le cas concret est une page d'erreur HTML renvoyée par un intermédiaire.
    respondWith('<html lang="fr"><body>Bad gateway</body></html>', {
      status: 404,
      contentType: 'text/html',
    });

    try {
      await apiRequest('/health');
      expect.unreachable('la requête devait échouer');
    } catch (error) {
      expect(error instanceof ApiError ? error.problem : null).toBeUndefined();
      expect(error instanceof ApiError ? error.userMessage : '').toBe(
        "La demande n'a pas pu être traitée.",
      );
    }
  });

  it('traite une panne de réseau comme un service injoignable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    try {
      await apiRequest('/health');
      expect.unreachable('la requête devait échouer');
    } catch (error) {
      expect(error instanceof ApiError ? error.status : 0).toBeUndefined();
      expect(error instanceof ApiError ? error.userMessage : '').toContain('injoignable');
    }
  });
});

describe('le jeton CSRF', () => {
  it("part en en-tête sur une requête qui modifie l'état, avec le type JSON", async () => {
    document.cookie = 'mijote_csrf=jeton-de-session';
    captureRequest();

    await apiRequest('/auth/logout', { method: 'POST' });

    expect(sentHeaders().get(CSRF_HEADER)).toBe('jeton-de-session');
    /*
      Le type de média est posé par le client et non par chaque appel : l'API
      refuse en 415 tout ce qui n'est pas du JSON, parce qu'un formulaire d'un
      autre site ne peut pas déclarer ce type.
    */
    expect(sentHeaders().get('content-type')).toBe('application/json');
  });

  it('ne part pas sur une lecture, qui ne modifie rien', async () => {
    document.cookie = 'mijote_csrf=jeton-de-session';
    captureRequest();

    await apiRequest('/health');

    // Aucun en-tête posé par le client : une lecture n'a rien à prouver.
    expect(sentHeaders().has(CSRF_HEADER)).toBe(false);
    expect(sentHeaders().has('content-type')).toBe(false);
  });

  it('se tait quand le cookie est absent', async () => {
    captureRequest();

    await apiRequest('/auth/logout', { method: 'POST' });

    // Pas de jeton inventé : la requête part sans, et le serveur la refuse.
    expect(sentHeaders().has(CSRF_HEADER)).toBe(false);
  });

  it('laisse un appelant choisir un autre type de média', async () => {
    captureRequest();

    await apiRequest('/import', { method: 'POST', headers: { 'content-type': 'text/csv' } });

    expect(sentHeaders().get('content-type')).toBe('text/csv');
  });

  it('trouve le jeton parmi plusieurs cookies', async () => {
    document.cookie = 'autre=1';
    document.cookie = 'mijote_csrf=jeton-de-session';
    captureRequest();

    await apiRequest('/auth/logout', { method: 'POST' });

    expect(sentHeaders().get(CSRF_HEADER)).toBe('jeton-de-session');
  });
});
