import { Injectable, Logger } from '@nestjs/common';
import { Bot, Context } from 'grammy';

import { SELLER_CODE } from '../common/common.constants';
import { UsersService } from '../users/users.service';
import {
  ACTIVATED_MESSAGE,
  BAD_SELLER_CODE_MESSAGE,
  HELP_MESSAGE,
  LOGOUT_MESSAGE,
  SEND_ORDER_MESSAGE,
  WELCOME_MESSAGE,
} from './telegram.messages';
import { TelegramOrderHandler } from './telegram-order.handler';
import { replyTo } from './telegram.utils';

@Injectable()
export class TelegramCommandHandler {
  private readonly logger = new Logger(TelegramCommandHandler.name);

  constructor(
    private readonly users: UsersService,
    private readonly orderHandler: TelegramOrderHandler,
  ) {}

  register(bot: Bot) {
    // bot.catch работает только при polling. При вебхуке ошибка ушла бы в Nest:
    // он записал бы в лог контекст вместе с токеном, а Telegram повторял бы обновление
    const chats = bot
      .errorBoundary(({ error }) => {
        this.logger.error(`Ошибка обработки обновления: ${String(error)}`);
      })
      .chatType('private');
    chats.command('start', (ctx) => this.start(ctx));
    chats.command('logout', (ctx) => this.logout(ctx));
    chats.command('help', (ctx) => replyTo(ctx, HELP_MESSAGE));
    // Незнакомая команда — не код продавца, иначе /help и опечатки дают «Неверный формат»
    chats.on('message:entities:bot_command', (ctx) =>
      replyTo(ctx, HELP_MESSAGE),
    );
    chats.on('message:document', (ctx) =>
      this.orderHandler.handleDocument(ctx),
    );
    chats.on('message:photo', (ctx) => this.orderHandler.handlePhoto(ctx));
    chats.on('message:text', (ctx) => this.text(ctx));
  }

  private async start(ctx: Context) {
    const profile = ctx.from!;
    const user = await this.users.find(profile.id);

    if (user) await this.users.clearLoggedOut(profile.id);
    else await this.users.register(profile);

    await replyTo(ctx, user?.isActive ? SEND_ORDER_MESSAGE : WELCOME_MESSAGE);
  }

  private async logout(ctx: Context) {
    await this.users.logout(ctx.from!.id);
    await replyTo(ctx, LOGOUT_MESSAGE);
  }

  private async text(ctx: Context) {
    const profile = ctx.from!;
    const user = await this.users.find(profile.id);

    if (!user) await this.users.register(profile);
    if (user?.loggedOut) return;
    if (user?.isActive) {
      await replyTo(ctx, SEND_ORDER_MESSAGE);
      return;
    }

    const sellerCode = ctx.message!.text!.trim();
    if (!SELLER_CODE.test(sellerCode)) {
      await replyTo(ctx, BAD_SELLER_CODE_MESSAGE);
      return;
    }
    await this.users.activate(profile.id, sellerCode);
    await replyTo(ctx, ACTIVATED_MESSAGE);
  }
}
