import { DynamicModule } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import appConfig from '../config/app.config';
import { transport } from './logger.utils';

// Настройка логов: уровень зависит от окружения (production — info, test — тишина, иначе debug)
export class LoggerModule {
  // GET-запросы в лог не пишем: они слишком шумные
  static forApp(): DynamicModule {
    return PinoLoggerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (cfg: ConfigType<typeof appConfig>) => ({
        pinoHttp: {
          level:
            cfg.nodeEnv === 'production'
              ? 'info'
              : cfg.nodeEnv === 'test'
                ? 'silent'
                : 'debug',
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
          autoLogging: {
            ignore: (req) => req.method === 'GET',
          },
          ...transport(cfg.nodeEnv),
        },
      }),
    });
  }
}
