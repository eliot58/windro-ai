import { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { API_KEY_HEADER, API_KEY_SECURITY } from './common/common.constants';
import appConfig from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      routerOptions: {
        ignoreTrailingSlash: true,
      },
    }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));

  await setupApp(app);

  const cfg = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  const isDev = cfg.nodeEnv === 'development';

  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle('Windro API')
      .setDescription(
        'Распознавание заявок на окна и заказ коммерческих предложений',
      )
      .setVersion('1.0')
      .addApiKey(
        { type: 'apiKey', name: API_KEY_HEADER, in: 'header' },
        API_KEY_SECURITY,
      )
      .build();

    const doc = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, doc, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks([], { useProcessExit: true });
  await app.listen(cfg.port, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  console.error('bootstrap failed', err);
  process.exit(1);
});
