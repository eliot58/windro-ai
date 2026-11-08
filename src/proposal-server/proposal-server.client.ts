import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

import proposalServerConfig from '../config/proposal-server.config';
import { AdditionalItem, OrderItem } from '../recognition/recognition.types';
import { ProposalSendResult } from './proposal-server.types';

// Сервер КП отвечает сразу, а готовый PDF присылает позже на адрес из поля url
@Injectable()
export class ProposalServerClient {
  private readonly logger = new Logger(ProposalServerClient.name);

  constructor(
    private readonly http: HttpService,
    @Inject(proposalServerConfig.KEY)
    private readonly config: ConfigType<typeof proposalServerConfig>,
  ) {}

  async send(
    sellerCode: string,
    orderItems: OrderItem[],
    addOrderitems: AdditionalItem[],
  ): Promise<ProposalSendResult> {
    if (!this.config.url) return { status: 'disabled' };

    try {
      const { status } = await firstValueFrom(
        this.http.post('/send_kp', {
          sellerCode,
          orderItems,
          ...(addOrderitems.length && { addOrderitems }),
          url: this.config.webhookUrl,
        }),
      );
      if (status === 200 || status === 202) return { status: 'accepted' };
      this.logger.error(`Сервер КП вернул статус ${status}`);
      return {
        status: 'failed',
        reason: `Сервер КП вернул ошибку ${status}.`,
      };
    } catch (error) {
      this.logger.error(`Сервер КП недоступен: ${String(error)}`);
      return {
        status: 'failed',
        reason: 'Сервер КП недоступен.',
      };
    }
  }
}
