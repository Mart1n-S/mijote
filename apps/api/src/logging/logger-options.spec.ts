import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { REQUEST_ID_HEADER } from '@mijote/shared';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
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
  it('réduit une erreur à son type, son message, son code et sa pile', () => {
    const lines: string[] = [];
    /*
      Les champs d'une erreur de PostgreSQL : `detail` porte la valeur fautive,
      et une erreur de client inactif porte l'objet de connexion entier.
    */
    const failure = Object.assign(new Error('insert into accounts a échoué'), {
      code: '23505',
      detail: 'Key (email)=(qui@exemple.fr) already exists.',
      where: 'table accounts',
      client: { connectionParameters: { password: 'motdepasse' } },
    });

    loggerWritingTo(lines).error({ err: failure }, 'conflit');

    const logged = lastLine(lines);
    const error = logged['err'];

    expect(error).toMatchObject({ type: 'Error', code: '23505' });
    expect(Object.keys(error ?? {}).sort()).toEqual(['code', 'message', 'stack', 'type']);
    expect(lines.join('')).not.toContain('qui@exemple.fr');
    expect(lines.join('')).not.toContain('motdepasse');
    expect(lines.join('')).not.toContain('already exists');
  });

  it('garde la cause sur un seul niveau', () => {
    const lines: string[] = [];
    const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

    loggerWritingTo(lines).error({ err: new Error('la requête a échoué', { cause }) }, 'échec');

    expect(lastLine(lines)['err']).toMatchObject({
      message: 'la requête a échoué',
      cause: { message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' },
    });
  });

  it("écrit une ligne d'accès par requête terminée", () => {
    const lines: string[] = [];
    const { request, response } = fakeExchange('/health?x=1');
    const middleware = pinoHttp(buildPinoHttpOptions({ NODE_ENV: 'development' }), {
      write(line: string): void {
        lines.push(line);
      },
    });

    middleware(request, response);
    // Sans en-tête écrit, `statusCode` reste nul : une vraie réponse passe par
    // là, celle-ci doit le faire explicitement.
    response.writeHead(200);
    /*
      La réponse n'a pas de socket connectée, donc `end()` n'émet pas
      `finish` : c'est cet événement que pino-http attend pour écrire sa ligne,
      et il est émis ici à sa place. Ce qui est mesuré reste bien le contenu de
      la ligne que nos options produisent.
    */
    response.emit('finish');

    const logged = lastLine(lines);

    expect(logged['req']).toMatchObject({ method: 'GET', route: '/health' });
    expect(logged['res']).toMatchObject({ statusCode: 200 });
    // La durée, et l'identifiant qui relie cette ligne aux autres.
    expect(logged['responseTime']).toEqual(expect.any(Number));
    expect(logged['req']).toHaveProperty('id');
  });
});
