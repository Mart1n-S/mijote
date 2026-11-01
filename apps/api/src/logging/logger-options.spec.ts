import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { REQUEST_ID_HEADER } from '@mijote/shared';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { buildPinoHttpOptions, resolveLogLevel } from './logger-options.js';

/*
  Les requêtes et réponses sont de vrais objets de node:http, construits sans
  socket connectée : c'est ce qui permet de mesurer les options telles que pino
  les recevra, sans assertion de type ni faux objet approximatif.
*/
function fakeExchange(url: string, headers: Record<string, string> = {}) {
  const request = Object.assign(new IncomingMessage(new Socket()), {
    method: 'GET',
    url,
    headers,
  });

  return { request, response: new ServerResponse(request) };
}

/**
 * Un pino bâti sur les options réelles, qui écrit dans un tableau.
 *
 * Les trois options qui nous intéressent sont reprises une par une et non par
 * diffusion : pino-http en porte d'autres, que `pino` lui-même n'accepte pas.
 */
function loggerWritingTo(lines: string[]) {
  const options = buildPinoHttpOptions({ NODE_ENV: 'development' });

  return pino(
    { level: options.level, serializers: options.serializers, redact: options.redact },
    {
      write(line: string): void {
        lines.push(line);
      },
    },
  );
}

function lastLine(lines: string[]): Record<string, unknown> {
  const line = lines.at(-1);

  expect(line, 'aucune ligne de journal écrite').toBeDefined();

  return JSON.parse(line ?? '{}') as Record<string, unknown>;
}

describe('resolveLogLevel', () => {
  it('journalise en debug en développement, en info ailleurs', () => {
    expect(resolveLogLevel({ NODE_ENV: 'development' })).toBe('debug');
    expect(resolveLogLevel({ NODE_ENV: 'production' })).toBe('info');
  });

  it('suit LOG_LEVEL quand elle est donnée', () => {
    expect(resolveLogLevel({ NODE_ENV: 'development', LOG_LEVEL: 'warn' })).toBe('warn');
    // Les espaces et la casse d'un fichier .env écrit à la main.
    expect(resolveLogLevel({ NODE_ENV: 'development', LOG_LEVEL: ' ERROR ' })).toBe('error');
  });

  it('coupe debug et trace en production', () => {
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toBe('info');
    expect(resolveLogLevel({ NODE_ENV: 'production', LOG_LEVEL: 'trace' })).toBe('info');
  });

  it('refuse un niveau inconnu en renvoyant à .env.example', () => {
    expect(() => resolveLogLevel({ LOG_LEVEL: 'bavard' })).toThrow(/\.env\.example/);
  });
});

describe('buildPinoHttpOptions', () => {
  it("engendre l'identifiant de requête et le pose en en-tête de réponse", () => {
    const { request, response } = fakeExchange('/health');
    const genReqId = buildPinoHttpOptions({}).genReqId;

    expect(genReqId, 'genReqId doit être défini').toBeDefined();

    const id = genReqId?.(request, response);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.getHeader(REQUEST_ID_HEADER)).toBe(id);
  });

  it('ignore un X-Request-Id reçu du client', () => {
    // Un identifiant venu du client servirait à polluer les journaux, ou à se
    // faire passer pour la trace d'une autre requête.
    const { request, response } = fakeExchange('/health', { 'x-request-id': 'venu-du-client' });
    const id = buildPinoHttpOptions({}).genReqId?.(request, response);

    expect(id).not.toBe('venu-du-client');
  });

  it("ne garde de la requête que la méthode, la route et l'identifiant", () => {
    const lines: string[] = [];
    const { request, response } = fakeExchange('/stores?address=12%20rue%20des%20Lilas', {
      authorization: 'Bearer secret',
      cookie: 'session=secret',
    });

    loggerWritingTo(lines).info({ req: Object.assign(request, { id: 'abc' }), res: response });

    const logged = lastLine(lines);

    expect(logged['req']).toEqual({ id: 'abc', method: 'GET', route: '/stores' });
    expect(logged['res']).toEqual({ statusCode: 200 });
    // L'adresse saisie pour trouver un magasin ne doit jamais être journalisée.
    expect(lines.join('')).not.toContain('Lilas');
    expect(lines.join('')).not.toContain('secret');
  });

  it('masque mot de passe, jeton et adresse e-mail', () => {
    const lines: string[] = [];

    loggerWritingTo(lines).info(
      { password: 'motdepasse', token: 'jeton', account: { email: 'qui@exemple.fr' } },
      'tentative de connexion',
    );

    const joined = lines.join('');

    expect(joined).not.toContain('motdepasse');
    expect(joined).not.toContain('jeton');
    expect(joined).not.toContain('qui@exemple.fr');
    expect(joined).toContain('[masqué]');
  });
});
