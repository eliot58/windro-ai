import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Bot } from 'grammy';

import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { ProposalServerClient } from '../../src/proposal-server/proposal-server.client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RecognitionService } from '../../src/recognition/recognition.service';
import { TELEGRAM_BOT } from '../../src/telegram/telegram.constants';

export const API = '/api/v1';
export const AUTH = { 'x-api-key': 'a'.repeat(64) };

interface TestDependencies {
  bot: Bot;
  prisma: object;
  recognition: Partial<RecognitionService>;
  proposalServer: Partial<ProposalServerClient>;
}

export async function createTestApp(
  dependencies: TestDependencies,
): Promise<NestFastifyApplication> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(dependencies.prisma)
    .overrideProvider(TELEGRAM_BOT)
    .useValue(dependencies.bot)
    .overrideProvider(RecognitionService)
    .useValue(dependencies.recognition)
    .overrideProvider(ProposalServerClient)
    .useValue(dependencies.proposalServer)
    .compile();

  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ routerOptions: { ignoreTrailingSlash: true } }),
  );

  await setupApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}

// Собирает multipart-тело для app.inject
export function multipart(
  fields: Record<string, string>,
  file?: { name: string; content: string },
) {
  const boundary = 'test-boundary';
  const parts = Object.entries(fields).map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  if (file) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n${file.content}\r\n`,
    );
  }
  return {
    headers: {
      ...AUTH,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: `${parts.join('')}--${boundary}--\r\n`,
  };
}
