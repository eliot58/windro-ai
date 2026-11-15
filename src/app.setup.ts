import fastifyMultipart from '@fastify/multipart';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { MAX_UPLOAD_SIZE } from './app.constants';

export async function setupApp(app: NestFastifyApplication) {
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_UPLOAD_SIZE },
  });

  app.setGlobalPrefix('api/v1');
}
