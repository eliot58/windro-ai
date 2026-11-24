import { join } from 'node:path';

import fastifyMultipart from '@fastify/multipart';
import fastifyView from '@fastify/view';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import handlebars from 'handlebars';

import { API_PREFIX, MAX_UPLOAD_SIZE } from './app.constants';

export async function setupApp(app: NestFastifyApplication) {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_UPLOAD_SIZE },
  });

  // Шаблоны страниц для людей. Регистрируем напрямую и ждём, как multipart:
  // app.setViewEngine не ждёт регистрацию и ломает порядок плагинов
  await app.register(fastifyView, {
    engine: { handlebars },
    root: join(__dirname, 'views'),
  });

  app.setGlobalPrefix(API_PREFIX);
}
