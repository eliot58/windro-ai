import { randomUUID } from 'node:crypto';

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { ProposalServerClient } from '../proposal-server/proposal-server.client';
import { RecognitionError } from '../recognition/recognition.error';
import { RecognitionService } from '../recognition/recognition.service';
import { OrderFile, RecognitionResult } from '../recognition/recognition.types';
import {
  INTERNAL_ERROR_MESSAGE,
  notRecognizedMessage,
  PROPOSAL_DISABLED_MESSAGE,
  REQUEST_TTL_MS,
} from './order-requests.constants';
import {
  OrderInput,
  OrderRequest,
  RecognizedHandler,
} from './order-requests.types';

@Injectable()
export class OrderRequestsService {
  private readonly logger = new Logger(OrderRequestsService.name);
  private readonly requests = new Map<string, OrderRequest>();

  constructor(
    private readonly http: HttpService,
    private readonly recognition: RecognitionService,
    private readonly proposalServer: ProposalServerClient,
  ) {}

  // Только распознать: результат сразу уходит на callback
  acceptRecognition(input: OrderInput): string {
    return this.start(input, (requestId, result) =>
      this.sendItems(requestId, result),
    );
  }

  // Распознать и заказать КП: PDF придёт позже на вебхук сервера КП
  acceptProposal(input: OrderInput): string {
    return this.start(input, (requestId, result) =>
      this.orderProposal(requestId, input.sellerCode, result),
    );
  }

  get(requestId: string): OrderRequest | undefined {
    this.removeExpired();
    return this.requests.get(requestId);
  }

  findIdBySellerCode(sellerCode: string): string | undefined {
    this.removeExpired();
    for (const [id, request] of this.requests) {
      if (request.sellerCode === sellerCode) return id;
    }
    return undefined;
  }

  // Сервер КП прислал готовый PDF: передаём его вместе с распознанными данными
  async deliverProposal(requestId: string, pdf: Buffer, message: string) {
    const request = this.take(requestId);
    if (!request) return;

    const form = new FormData();
    form.set('requestId', requestId);
    form.set('status', 'completed');
    form.set('orderItems', JSON.stringify(request.orderItems));
    form.set('message', message);
    if (request.addOrderitems.length) {
      form.set('addOrderitems', JSON.stringify(request.addOrderitems));
    }
    form.set(
      'file',
      new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
      'commercial_proposal.pdf',
    );
    await this.post(requestId, request.callbackUrl, form);
  }

  async sendError(requestId: string, errorType: string, message: string) {
    const request = this.take(requestId);
    if (!request) return;
    await this.post(requestId, request.callbackUrl, {
      requestId,
      status: 'error',
      errorType,
      message,
    });
  }

  private start(input: OrderInput, onRecognized: RecognizedHandler): string {
    this.removeExpired();

    const requestId = randomUUID();
    this.requests.set(requestId, {
      callbackUrl: input.callbackUrl,
      sellerCode: input.sellerCode,
      createdAt: Date.now(),
      orderItems: [],
      addOrderitems: [],
    });

    void this.process(requestId, input.file, onRecognized).catch(
      async (error: unknown) => {
        this.logger.error(`[${requestId}] ${String(error)}`);
        await this.sendError(
          requestId,
          'internal_error',
          INTERNAL_ERROR_MESSAGE,
        );
      },
    );
    return requestId;
  }

  private async process(
    requestId: string,
    file: OrderFile,
    onRecognized: RecognizedHandler,
  ) {
    let result: RecognitionResult;
    try {
      result = await this.recognition.recognize(file);
    } catch (error) {
      if (!(error instanceof RecognitionError)) throw error;
      await this.sendError(
        requestId,
        'pipeline_error',
        notRecognizedMessage(error.message),
      );
      return;
    }
    await onRecognized(requestId, result);
  }

  private async orderProposal(
    requestId: string,
    sellerCode: string,
    result: RecognitionResult,
  ) {
    const request = this.requests.get(requestId);
    if (request) {
      request.orderItems = result.orderItems;
      request.addOrderitems = result.addOrderitems;
    }

    const proposal = await this.proposalServer.send(
      sellerCode || requestId,
      result.orderItems,
      result.addOrderitems,
    );
    if (proposal.status === 'disabled') {
      await this.sendItems(requestId, result, PROPOSAL_DISABLED_MESSAGE);
    } else if (proposal.status === 'failed') {
      await this.sendError(requestId, 'kp_server_error', proposal.reason);
    }
  }

  private async sendItems(
    requestId: string,
    result: RecognitionResult,
    message?: string,
  ) {
    const request = this.take(requestId);
    if (!request) return;
    await this.post(requestId, request.callbackUrl, {
      requestId,
      status: 'completed',
      orderItems: result.orderItems,
      ...(result.addOrderitems.length && {
        addOrderitems: result.addOrderitems,
      }),
      ...(message && { message }),
    });
  }

  private take(requestId: string): OrderRequest | undefined {
    const request = this.requests.get(requestId);
    this.requests.delete(requestId);
    return request;
  }

  private async post(requestId: string, url: string, body: object) {
    try {
      await firstValueFrom(this.http.post(url, body));
    } catch (error) {
      this.logger.error(
        `[${requestId}] Callback не доставлен: ${String(error)}`,
      );
    }
  }

  private removeExpired() {
    const deadline = Date.now() - REQUEST_TTL_MS;
    for (const [id, request] of this.requests) {
      if (request.createdAt < deadline) this.requests.delete(id);
    }
  }
}
