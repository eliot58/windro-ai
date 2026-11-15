import {
  BadRequestException,
  Controller,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { SELLER_CODE } from '../common/common.constants';
import { SubmittedForm } from '../common/common.types';
import { readForm } from '../common/form-reader';
import {
  PROPOSAL_FAILED_MESSAGE,
  PROPOSAL_READY_MESSAGE,
  PROPOSAL_SEND_ERROR_MESSAGE,
  proposalErrorMessage,
} from '../telegram/telegram.messages';
import { TelegramNotifier } from '../telegram/telegram.notifier';
import { UsersService } from '../users/users.service';
import { OrderRequestsService } from './order-requests.service';

// Сервер КП присылает сюда готовый PDF. sellerCode из ожидающего запроса фронтенда
// ведёт на его callback, код XXXX-XXXX ведёт к пользователю Telegram
@ApiExcludeController()
@Controller('proposals/webhook')
export class ProposalWebhookController {
  private readonly logger = new Logger(ProposalWebhookController.name);

  constructor(
    private readonly orderRequests: OrderRequestsService,
    private readonly users: UsersService,
    private readonly notifier: TelegramNotifier,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(@Req() request: FastifyRequest) {
    const form = await readForm(request);
    const sellerCode = form.fields.sellerCode ?? '';
    const pendingId = this.orderRequests.findIdBySellerCode(sellerCode);

    if (!pendingId && SELLER_CODE.test(sellerCode)) {
      return this.toTelegram(sellerCode, form);
    }
    return this.toFrontend(pendingId ?? sellerCode, form);
  }

  // Код продавца могут использовать несколько человек, КП получают все
  private async toTelegram(sellerCode: string, form: SubmittedForm) {
    if (!['success', 'error'].includes(form.fields.status)) {
      throw new BadRequestException('Invalid status in webhook');
    }

    const users = await this.users.findAllBySellerCode(sellerCode);
    if (!users.length) return { status: 'error', message: 'User not found' };

    const results = await Promise.allSettled(
      users.map((user) => this.notifyUser(Number(user.id), form)),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(`КП не доставлено: ${String(result.reason)}`);
      }
    }
    return { status: 'ok' };
  }

  private async notifyUser(chatId: number, { fields, file }: SubmittedForm) {
    const message = fields.message ?? PROPOSAL_READY_MESSAGE;

    if (fields.status === 'error') {
      await this.notifier.sendMessage(
        chatId,
        proposalErrorMessage(message, fields.error ?? 'UNKNOWN_ERROR'),
      );
      return;
    }
    if (!file) {
      await this.notifier.sendMessage(chatId, PROPOSAL_FAILED_MESSAGE);
      return;
    }

    await this.notifier.sendMessage(chatId, `✅ ${message}`);
    try {
      await this.notifier.sendProposal(chatId, file.content);
    } catch (error) {
      await this.notifier.sendMessage(chatId, PROPOSAL_SEND_ERROR_MESSAGE);
      throw error;
    }
  }

  private async toFrontend(requestId: string, { fields, file }: SubmittedForm) {
    if (!this.orderRequests.get(requestId)) {
      throw new NotFoundException(`Request ${requestId} not found or expired`);
    }

    const message = fields.message ?? PROPOSAL_READY_MESSAGE;
    if (fields.status === 'success' && file) {
      await this.orderRequests.deliverProposal(
        requestId,
        file.content,
        message,
      );
    } else {
      await this.orderRequests.sendError(
        requestId,
        'kp_generation_error',
        message,
      );
    }
    return { status: 'ok' };
  }
}
