import { CSRF_HEADER, problemDetailsSchema, type ProblemDetails } from '@mijote/shared';
import { Controller, Get, Module, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { resolveTrustProxy } from '../security/trust-proxy.js';

import { CSRF_EXEMPT_ROUTES } from './csrf.guard.js';
import { Public } from './public.decorator.js';
import { readClientIp } from './request-context.js';
import { Roles } from './roles.decorator.js';

/*
  Les refus des gardes, mesurés à travers l'application réelle.

  Aucun PostgreSQL ne tourne : DATABASE_URL vise un port fermé, comme dans
  app.http.spec.ts. Ce fichier ne couvre donc que ce qui est refusé **avant**
  toute lecture en base, c'est-à-dire exactement les trois barrières du CSRF et
  la garde de session. Le parcours complet, qui a besoin de données, vit dans
  auth.integration.spec.ts.
*/

/** Deux routes qui n'existent que pour ce test. */
@Controller('test-auth')
class TestAuthController {
  @Public()
  @Get('client')
  client(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get('ip')
  ip(@Req() request: unknown): { ip: string } {
    return { ip: readClientIp(request) };
  }

  @Get('protegee')
  protegee(): { ok: true } {
    return { ok: true };
  }

  @Roles('admin')
  @Get('admin')
  admin(): { ok: true } {
    return { ok: true };
  }
}

@Module({ imports: [AppModule], controllers: [TestAuthController] })
class TestAppModule {}

let app: NestExpressApplication;
let baseUrl: string;

async function problemAt(path: string, init?: RequestInit): Promise<ProblemDetails> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body: unknown = await response.json();
  const problem = problemDetailsSchema.parse(body);

  expect(problem.status).toBe(response.status);

  return problem;
}

/** Un corps de connexion, avec les en-têtes qu'un navigateur poserait. */
function loginRequest(overrides: Partial<RequestInit> = {}): RequestInit {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseUrl,
      ...(overrides.headers ?? {}),
    },
    body: JSON.stringify({ email: 'martin@exemple.test', password: 'un mot de passe assez long' }),
    ...('body' in overrides ? { body: overrides.body } : {}),
  };
}

beforeAll(async () => {
  process.env['LOG_LEVEL'] = 'silent';
  process.env['DATABASE_URL'] = 'postgres://mijote:none@127.0.0.1:1/none';
  process.env['SMTP_HOST'] = '127.0.0.1';
  process.env['SMTP_PORT'] = '1025';
  process.env['MAIL_FROM'] = 'Mijote <no-reply@mijote.local>';
  // Un poivre de test, fait de zéros : il ne protège rien ici.
  process.env['SECURITY_PEPPER'] = Buffer.alloc(32).toString('base64');
  process.env['SECURITY_TOTP_KEY'] = Buffer.alloc(32).toString('base64');
  delete process.env['TRUST_PROXY'];

  app = await NestFactory.create<NestExpressApplication>(TestAppModule, { logger: false });
  // Le même réglage que main.ts, sans quoi ce test ne mesurerait pas ce que la
  // production fait.
  app.set('trust proxy', resolveTrustProxy(process.env));

  await app.listen(0);

  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('la garde de session', () => {
  it('refuse une route protégée sans session, au format RFC 9457', async () => {
    const problem = await problemAt('/test-auth/protegee');

    expect(problem.status).toBe(401);
    expect(problem.title).toBe('Authentification requise');
    expect(problem.detail).toBe('Cette action demande une authentification.');
    expect(problem.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuse aussi une route réservée aux administrateurs', async () => {
    // La garde de session passe avant celle du rôle : sans session, c'est 401,
    // et le 403 ne peut venir que d'un compte connecté au mauvais rôle.
    expect((await problemAt('/test-auth/admin')).status).toBe(401);
  });

  it('laisse passer une route ouverte par @Public()', async () => {
    const response = await fetch(`${baseUrl}/test-auth/client`);

    expect(response.status).toBe(200);
  });

  it('dit que personne est connecté sans cookie, et ne touche pas la base', async () => {
    const problem = await problemAt('/auth/session');

    expect(problem.status).toBe(401);
    // Si la base avait été interrogée, ce serait un 500 : son port est fermé.
    expect(problem.detail).toBe('Cette action demande une authentification.');
  });
});

describe('les barrières du CSRF', () => {
  it("refuse en 415 ce qui n'est pas du JSON, même avec un corps JSON valide", async () => {
    /*
      C'est la barrière qui tient sans aucun en-tête de navigateur : un
      formulaire d'un autre site ne peut envoyer que trois types de média, dont
      text/plain, et il ne peut pas déclarer application/json sans demander
      d'abord la permission par une requête préalable.
    */
    const problem = await problemAt(
      '/auth/login',
      loginRequest({ headers: { 'content-type': 'text/plain' } }),
    );

    expect(problem.status).toBe(415);
    expect(problem.title).toBe('Type de média non supporté');
    expect(problem.detail).toBe('Le type de média doit être application/json.');
  });

  it('refuse un type de média absent', async () => {
    const problem = await problemAt('/auth/login', {
      method: 'POST',
      headers: { origin: baseUrl },
      body: 'rien',
    });

    expect(problem.status).toBe(415);
  });

  it('accepte application/json avec son paramètre de jeu de caractères', async () => {
    const problem = await problemAt(
      '/auth/login',
      loginRequest({ headers: { 'content-type': 'application/json; charset=utf-8' } }),
    );

    // Passé le type de média et l'origine, c'est la base qui manque : la
    // requête est donc allée jusqu'au service.
    expect(problem.status).not.toBe(415);
    expect(problem.status).not.toBe(403);
  });

  it('refuse une origine différente, et une origine absente', async () => {
    const other = await problemAt(
      '/auth/login',
      loginRequest({ headers: { origin: 'https://ailleurs.example' } }),
    );

    expect(other.status).toBe(403);
    expect(other.detail).toBe("Cette requête ne vient pas de l'application.");

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const bare = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'martin@exemple.test', password: 'assez long pour passer' }),
    });

    // Ni Origin ni Sec-Fetch-Site : refusée. C'est le cas d'un client qui n'est
    // pas un navigateur, et qui n'a donc pas de cookie à détourner, mais
    // refuser est le bon défaut sur un chemin qui modifie l'état.
    expect(bare.status).toBe(403);
  });

  it("n'accepte en repli que Sec-Fetch-Site: same-origin, jamais same-site", async () => {
    const sameSite = await problemAt(
      '/auth/login',
      loginRequest({ headers: { origin: '', 'sec-fetch-site': 'same-site' } }),
    );

    // Un service voisin sur un sous-domaine du même domaine est « same-site ».
    expect(sameSite.status).toBe(403);

    const sameOrigin = await problemAt(
      '/auth/login',
      loginRequest({ headers: { origin: '', 'sec-fetch-site': 'same-origin' } }),
    );

    expect(sameOrigin.status).not.toBe(403);
  });

  it("exige le jeton CSRF sur une route qui modifie l'état", async () => {
    const problem = await problemAt('/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
    });

    /*
      Sans session, c'est la garde de session qui refuse la première : le 401
      arrive donc avant le 403. Ce qui compte ici est que la déconnexion ne soit
      pas dans la liste des routes exemptées.
    */
    expect(problem.status).toBe(401);
    expect(CSRF_EXEMPT_ROUTES.some((route) => route.path === '/auth/logout')).toBe(false);
  });

  it('laisse passer les méthodes qui ne modifient rien', async () => {
    const response = await fetch(`${baseUrl}/test-auth/client`, {
      method: 'GET',
      headers: { origin: 'https://ailleurs.example' },
    });

    /*
      Une lecture n'a pas de jeton à présenter, et son origine n'est pas
      contrôlée : ce qui protège une lecture, c'est qu'elle ne change rien, et
      qu'aucun CORS n'autorise l'autre site à lire la réponse.
    */
    expect(response.status).toBe(200);
  });

  it("n'exempte pas la soumission du code, qui porte son propre jeton", () => {
    /*
      L'attente de code a son propre secret CSRF, donc cette route peut
      présenter un jeton comme n'importe quelle autre : elle n'a pas besoin
      d'être exemptée, et la liste reste à une seule entrée.

      Ses deux premières barrières ne s'observent pas ici : la garde de session
      tourne avant celle du CSRF, et sans attente valide elle refuse en 401
      avant tout. C'est auth.integration.spec.ts, où une vraie attente existe,
      qui mesure le 415 et le 403.
    */
    expect(CSRF_EXEMPT_ROUTES.some((route) => route.path.includes('two-factor'))).toBe(false);
  });

  it('refuse la soumission du code sans attente, sans toucher la base', async () => {
    const problem = await problemAt('/auth/two-factor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify({ code: '123456' }),
    });

    /*
      Le cookie d'attente manque : 401, et le message ne dépend d'aucune donnée.
      Si la base avait été interrogée, ce serait un 500, son port étant fermé.
    */
    expect(problem.status).toBe(401);
    expect(problem.detail).toBe('La vérification a expiré. Recommencez la connexion.');
  });

  it('refuse les routes du second facteur sans session', async () => {
    for (const [method, path] of [
      ['POST', '/auth/two-factor/setup'],
      ['POST', '/auth/two-factor/activate'],
      ['POST', '/auth/two-factor/unlock'],
      ['POST', '/auth/two-factor/disable'],
    ] as const) {
      const problem = await problemAt(path, {
        method,
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ password: 'peu importe', code: '123456' }),
      });

      expect(problem.status, `${method} ${path}`).toBe(401);
      expect(problem.detail, `${method} ${path}`).toBe(
        'Cette action demande une authentification.',
      );
    }
  });

  it('exempte la connexion, et elle seule', () => {
    /*
      La liste est énumérée ici, mot pour mot. S'y ajouter une route demande de
      changer ce test, donc de dire pourquoi la route ne peut pas porter le
      jeton.
    */
    expect(CSRF_EXEMPT_ROUTES).toEqual([{ method: 'POST', path: '/auth/login' }]);
  });

  it('ne se laisse pas contourner par une barre oblique en trop', async () => {
    const problem = await problemAt(
      '/auth/login/',
      loginRequest({ headers: { 'content-type': 'text/plain' } }),
    );

    // Express sert la même route pour /auth/login et /auth/login/ : la liste
    // des exemptions doit les voir pareil, et les barrières s'appliquer.
    expect(problem.status).toBe(415);
  });

  it("n'accepte pas un jeton CSRF envoyé seul, sans session", async () => {
    const problem = await problemAt('/auth/logout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl,
        [CSRF_HEADER]: 'un jeton inventé',
      },
    });

    expect(problem.status).toBe(401);
  });
});

describe('le mandataire inverse', () => {
  it("compte l'adresse réelle du client quand le mandataire est de confiance", async () => {
    const response = await fetch(`${baseUrl}/test-auth/ip`, {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    const body: unknown = await response.json();

    /*
      La requête vient de la boucle locale, qui est le mandataire de confiance
      par défaut : X-Forwarded-For est donc cru, et c'est cette adresse que la
      limitation compte.
    */
    expect(body).toEqual({ ip: '203.0.113.7' });
  });

  describe("quand le client n'est pas le mandataire déclaré", () => {
    let strict: NestExpressApplication;
    let strictUrl: string;

    beforeAll(async () => {
      // Un mandataire déclaré ailleurs : la boucle locale n'est plus crue.
      process.env['TRUST_PROXY'] = '198.51.100.1';
      strict = await NestFactory.create<NestExpressApplication>(TestAppModule, { logger: false });
      strict.set('trust proxy', resolveTrustProxy(process.env));

      await strict.listen(0);

      strictUrl = await strict.getUrl();
    });

    afterAll(async () => {
      delete process.env['TRUST_PROXY'];

      await strict.close();
    });

    it('ignore X-Forwarded-For et compte la vraie adresse de la connexion', async () => {
      /*
        Sans ce réglage, n'importe qui écrirait l'en-tête lui-même et se
        donnerait une IP neuve à chaque essai : la limitation par IP ne
        compterait plus rien.
      */
      const response = await fetch(`${strictUrl}/test-auth/ip`, {
        headers: { 'x-forwarded-for': '203.0.113.7' },
      });
      const body: unknown = await response.json();

      expect(body).not.toEqual({ ip: '203.0.113.7' });
      expect(JSON.stringify(body)).toMatch(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/);
    });
  });
});
