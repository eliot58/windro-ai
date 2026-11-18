import { randomUUID } from 'node:crypto';

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { RecognitionError } from '../recognition/recognition.error';
import { RecognitionService } from '../recognition/recognition.service';
import { RecognitionResult } from '../recognition/recognition.types';
import {
  INTERNAL_ERROR_MESSAGE,
  notRecognizedMessage,
} from './order-requests.constants';
import { RecognitionErrorType, RecognitionInput } from './order-requests.types';

// Распознаёт заявку в фоне и присылает результат на callback_url
@Injectable()
export class OrderRequestsService {
  private readonly logger = new Logger(OrderRequestsService.name);

  constructor(
    private readonly http: HttpService,
    private readonly recognition: RecognitionService,
  ) {}

  accept(input: RecognitionInput): string {
    const requestId = randomUUID();
    void this.process(requestId, input).catch(async (error: unknown) => {
      this.logger.error(`[${requestId}] ${String(error)}`);
      await this.sendError(
        requestId,
        input.callbackUrl,
        'internal_error',
        INTERNAL_ERROR_MESSAGE,
      );
    });
    return requestId;
  }

  private async process(
    requestId: string,
    { file, callbackUrl }: RecognitionInput,
  ) {
    let result: RecognitionResult;
    try {
      result = await this.recognition.recognize(file);
    } catch (error) {
      if (!(error instanceof RecognitionError)) throw error;
      await this.sendError(
        requestId,
        callbackUrl,
        'pipeline_error',
        notRecognizedMessage(error.message),
      );
      return;
    }

    await this.post(requestId, callbackUrl, {
      request_id: requestId,
      status: 'completed',
      orderItems: result.orderItems,
      ...(result.addOrderitems.length && {
        addOrderitems: result.addOrderitems,
      }),
    });
  }

  private sendError(
    requestId: string,
    callbackUrl: string,
    errorType: RecognitionErrorType,
    message: string,
  ) {
    return this.post(requestId, callbackUrl, {
      request_id: requestId,
      status: 'error',
      error_type: errorType,
      message,
    });
  }

  private async post(requestId: string, url: string, body: object) {
    try {
      await firstValueFrom(this.http.post(url, body));
      this.logger.log(`[${requestId}] Результат отправлен на ${url}`);
    } catch (error) {
      this.logger.error(
        `[${requestId}] Callback не доставлен: ${String(error)}`,
      );
    }
  }
}
