import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Bot } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { proxyOptions } from '../common/http.utils';
import telegramConfig from '../config/telegram.config';
import { ProposalServerModule } from '../proposal-server/proposal-server.module';
import { RecognitionModule } from '../recognition/recognition.module';
import { UsersModule } from '../users/users.module';
import { TelegramCommandHandler } from './telegram-command.handler';
import {
  TELEGRAM_BOT,
  TELEGRAM_DOWNLOAD_TIMEOUT_MS,
  TELEGRAM_FILE_API_URL,
} from './telegram.constants';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramNotifier } from './telegram.notifier';
import { TelegramOrderHandler } from './telegram-order.handler';
import { TelegramWebhookSetup } from './telegram-webhook.setup';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [telegramConfig.KEY],
      useFactory: ({
        botToken,
        proxyUrl,
      }: ConfigType<typeof telegramConfig>) => ({
        baseURL: `${TELEGRAM_FILE_API_URL}/bot${botToken}`,
        responseType: 'arraybuffer',
        timeout: TELEGRAM_DOWNLOAD_TIMEOUT_MS,
        ...proxyOptions(proxyUrl),
      }),
    }),
    UsersModule,
    ProposalServerModule,
    RecognitionModule,
  ],
  providers: [
    {
      provide: TELEGRAM_BOT,
      inject: [telegramConfig.KEY],
      useFactory: ({ botToken, proxyUrl }: ConfigType<typeof telegramConfig>) =>
        new Bot(botToken, {
          client: proxyUrl
            ? {
                baseFetchConfig: {
                  agent: new HttpsProxyAgent(proxyUrl),
                },
              }
            : undefined,
        }),
    },
    TelegramCommandHandler,
    TelegramNotifier,
    TelegramOrderHandler,
    TelegramWebhookSetup,
  ],
  controllers: [TelegramWebhookController],
  exports: [TELEGRAM_BOT, TelegramNotifier],
})
export class TelegramModule {}
