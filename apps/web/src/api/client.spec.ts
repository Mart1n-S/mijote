import { PROBLEM_DETAILS_MEDIA_TYPE } from '@mijote/shared';
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
});

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
