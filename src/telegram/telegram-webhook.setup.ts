import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Bot } from 'grammy';

import telegramConfig from '../config/telegram.config';
import { TelegramCommandHandler } from './telegram-command.handler';
import { TELEGRAM_BOT } from './telegram.constants';

@Injectable()
export class TelegramWebhookSetup implements OnModuleInit {
  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: Bot,
    @Inject(telegramConfig.KEY)
    private readonly config: ConfigType<typeof telegramConfig>,
    private readonly commandHandler: TelegramCommandHandler,
  ) {}

  // Регистрируем команды и при каждом старте заново ставим вебхук
  async onModuleInit() {
    this.commandHandler.register(this.bot);

    await this.bot.api.setWebhook(this.config.webhookUrl, {
      secret_token: this.config.webhookSecret,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
  }
}
