import { Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Bot, webhookCallback } from 'grammy';

import telegramConfig from '../config/telegram.config';
import { TELEGRAM_BOT } from './telegram.constants';

// Вебхук вызывает только Telegram, поэтому в Swagger он не нужен
@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
  private readonly handleUpdate: (
    req: FastifyRequest,
    res: FastifyReply,
  ) => Promise<unknown>;

  constructor(
    @Inject(TELEGRAM_BOT) bot: Bot,
    @Inject(telegramConfig.KEY) config: ConfigType<typeof telegramConfig>,
  ) {
    this.handleUpdate = webhookCallback(bot, 'fastify', {
      secretToken: config.webhookSecret,
    });
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    return this.handleUpdate(req, res);
  }
}
