import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './config/app.config';
import { configSchema } from './config/config.schema';
import databaseConfig from './config/database.config';
import llmConfig from './config/llm.config';
import proposalServerConfig from './config/proposal-server.config';
import telegramConfig from './config/telegram.config';
import { LoggerModule } from './logger/logger.module';
import { OrderRequestsModule } from './order-requests/order-requests.module';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramModule } from './telegram/telegram.module';

// Корневой модуль HTTP API: конфиги, логи, БД, Telegram-бот и модули с эндпоинтами
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        appConfig,
        databaseConfig,
        telegramConfig,
        llmConfig,
        proposalServerConfig,
      ],
      validationSchema: configSchema,
      validationOptions: {
        libraryOptions: { allowUnknown: true, abortEarly: true },
      },
    }),
    LoggerModule.forApp(),
    PrismaModule,
    TelegramModule,
    OrderRequestsModule,
  ],
})
export class AppModule {}
