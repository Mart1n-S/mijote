import { Body, Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  PROBLEM_DETAILS_MEDIA_TYPE,
  problemDetailsSchema,
  REQUEST_ID_HEADER,
  type ProblemDetails,
} from '@mijote/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppModule } from './app.module.js';
import { ZodValidationPipe } from './errors/zod-validation.pipe.js';

/*
  Le format d'erreur se mesure ici, à travers l'application réelle, et non sur
  le filtre instancié à la main : ce qui compte est qu'il soit branché, qu'il
  attrape ce que NestJS lève de lui-même, et que la réponse sorte avec le bon
  type de média. Un filtre appelé directement ne prouverait rien de tout cela.

  C'est ce que l'ADR 0002 annonçait : ce fichier est le premier à traverser le
  conteneur NestJS, d'où swc dans la configuration Vitest de ce paquet.

  Aucun PostgreSQL ne tourne : DATABASE_URL vise un port fermé, ce qui est
  exactement le cas « base indisponible » que l'issue demande de couvrir. Le cas
  où la base répond vit dans health.controller.spec.ts.
*/

const householdSchema = z.object({ size: z.number().int().positive() });

@Controller('test-errors')
class TestErrorsController {
  @Get('boom')
  boom(): never {
    // Ni ce message, ni cette trace ne doivent arriver au navigateur.
    throw new Error('echec interne : select * from accounts where email = $1');
  }

  @Post('household')
  household(
    @Body(new ZodValidationPipe(householdSchema)) body: z.infer<typeof householdSchema>,
  ): z.infer<typeof householdSchema> {
    return body;
  }
}

// L'application réelle, plus deux routes qui n'existent que pour ce test.
@Module({ imports: [AppModule], controllers: [TestErrorsController] })
class TestAppModule {}

let app: INestApplication;
let baseUrl: string;

/** La réponse, avec son problème RFC 9457 validé par le schéma partagé. */
async function problemAt(
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; problem: ProblemDetails }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body: unknown = await response.json();
  const parsed = problemDetailsSchema.safeParse(body);

  expect(parsed.success, `le corps de ${path} n'est pas un problème RFC 9457`).toBe(true);

  return { response, problem: parsed.data ?? problemDetailsSchema.parse(body) };
}

beforeAll(async () => {
  process.env['LOG_LEVEL'] = 'silent';
  // Port 1 : la connexion est refusée tout de suite, donc la sonde répond vite.
  process.env['DATABASE_URL'] = 'postgres://mijote:none@127.0.0.1:1/none';

  app = await NestFactory.create(TestAppModule, { logger: false });

  await app.listen(0);

  baseUrl = await app.getUrl();
});

afterAll(async () => {
  // Ferme aussi le pool, par le crochet d'arrêt de DatabaseModule.
  await app.close();
});

describe("les erreurs de l'API", () => {
  it('renvoie un 404 au format RFC 9457 sur une route inconnue', async () => {
    const { response, problem } = await problemAt('/inconnue');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain(PROBLEM_DETAILS_MEDIA_TYPE);
    expect(problem.title).toBe('Ressource introuvable');
    expect(problem.status).toBe(404);
  });

  it('renvoie un 500 générique, sans rien de technique', async () => {
    const { response, problem } = await problemAt('/test-errors/boom');

    expect(response.status).toBe(500);
    expect(problem.title).toBe('Erreur interne');
    expect(problem.detail).toContain('inattendue');
    // Ni le message d'origine, ni la requête SQL, ni une trace.
    expect(JSON.stringify(problem)).not.toContain('select');
    expect(JSON.stringify(problem)).not.toContain('accounts');
    expect(JSON.stringify(problem)).not.toMatch(/at .+\.ts:\d+/);
  });

  it('renvoie la liste des champs en erreur, en français', async () => {
    const { response, problem } = await problemAt('/test-errors/household', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: -1 }),
    });

    expect(response.status).toBe(400);
    expect(problem.title).toBe('Requête invalide');
    expect(problem.errors).toHaveLength(1);
    expect(problem.errors?.[0]?.field).toBe('size');
    expect(problem.errors?.[0]?.message).not.toBe('');
  });

  it('accepte un corps valide', async () => {
    const response = await fetch(`${baseUrl}/test-errors/household`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 3 }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ size: 3 });
  });

  it('renvoie un 503 quand la base ne répond pas', async () => {
    const { response, problem } = await problemAt('/health');

    expect(response.status).toBe(503);
    expect(problem.title).toBe('Service indisponible');
    // L'état de l'infrastructure ne se raconte pas au navigateur.
    expect(problem.detail).not.toMatch(/base|postgres|ECONNREFUSED/i);
  });
});

describe("l'identifiant de requête", () => {
  it("part en en-tête et se retrouve dans le corps de l'erreur", async () => {
    const { response, problem } = await problemAt('/inconnue');
    const header = response.headers.get(REQUEST_ID_HEADER);

    expect(header).toMatch(/^[0-9a-f-]{36}$/);
    expect(problem.requestId).toBe(header);
  });

  it('change à chaque requête', async () => {
    const first = await fetch(`${baseUrl}/inconnue`);
    const second = await fetch(`${baseUrl}/inconnue`);

    expect(first.headers.get(REQUEST_ID_HEADER)).not.toBe(second.headers.get(REQUEST_ID_HEADER));
  });

  it("est posé aussi sur une réponse qui n'est pas une erreur", async () => {
    // La sonde échoue ici, mais l'en-tête ne dépend pas du résultat : il est
    // posé à l'arrivée de la requête, pas à la sortie de la réponse.
    const response = await fetch(`${baseUrl}/test-errors/household`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ size: 1 }),
    });

    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
