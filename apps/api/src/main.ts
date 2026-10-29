import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { loadEnvFile } from './env.js';

loadEnvFile();

const app = await NestFactory.create(AppModule);

app.enableShutdownHooks();

await app.listen(Number(process.env['API_PORT'] ?? 3000));
