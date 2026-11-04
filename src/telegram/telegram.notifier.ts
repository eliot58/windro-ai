import { setTimeout as sleep } from 'node:timers/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Bot, InputFile } from 'grammy';

import {
  RETRY_DELAY_MS,
  SEND_ATTEMPTS,
  TELEGRAM_BOT,
} from './telegram.constants';
import { PROPOSAL_CAPTION } from './telegram.messages';

@Injectable()
export class TelegramNotifier {
  private readonly logger = new Logger(TelegramNotifier.name);

  constructor(@Inject(TELEGRAM_BOT) private readonly bot: Bot) {}

  async sendMessage(chatId: number, text: string) {
    await this.bot.api.sendMessage(chatId, text);
  }

  // Файл уходит через прокси и иногда обрывается, поэтому есть повторы
  async sendProposal(chatId: number, pdf: Buffer) {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.bot.api.sendDocument(
          chatId,
          new InputFile(pdf, 'commercial_proposal.pdf'),
          { caption: PROPOSAL_CAPTION },
        );
        return;
      } catch (error) {
        this.logger.warn(`Отправка КП, попытка ${attempt}: ${String(error)}`);
        if (attempt === SEND_ATTEMPTS) throw error;
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
}
