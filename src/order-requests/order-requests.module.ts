import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { ProposalServerModule } from '../proposal-server/proposal-server.module';
import { RecognitionModule } from '../recognition/recognition.module';
import { UsersModule } from '../users/users.module';
import { ProposalWebhookController } from './proposal-webhook.controller';
import { CALLBACK_TIMEOUT_MS } from './order-requests.constants';
import { OrderRequestsController } from './order-requests.controller';
import { OrderRequestsService } from './order-requests.service';

@Module({
  imports: [
    // Адрес callback у каждого запроса свой, поэтому общего baseURL здесь нет
    HttpModule.register({ timeout: CALLBACK_TIMEOUT_MS }),
    ProposalServerModule,
    RecognitionModule,
    UsersModule,
  ],
  controllers: [OrderRequestsController, ProposalWebhookController],
  providers: [OrderRequestsService],
})
export class OrderRequestsModule {}
