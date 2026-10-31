import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.js';
import { loadEnvFile } from './env.js';

loadEnvFile();

const app = await NestFactory.create<NestExpressApplication>(AppModule);

// Express annonce sa pile par X-Powered-By sur chaque réponse, y compris sur
// une route inconnue. Rien à y gagner, et cela épargne à un balayage
// automatique le travail de l'identifier.
//
// Ce retrait est isolé pour l'instant : l'issue #31 réunira les en-têtes de
// sécurité dans un middleware Express, et il ira l'y rejoindre.
app.disable('x-powered-by');

app.enableShutdownHooks();

await app.listen(Number(process.env['API_PORT'] ?? 3000));
