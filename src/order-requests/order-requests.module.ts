import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { RecognitionModule } from '../recognition/recognition.module';
import { UsersModule } from '../users/users.module';
import { ProposalWebhookController } from './proposal-webhook.controller';
import { CALLBACK_TIMEOUT_MS } from './order-requests.constants';
import { RecognitionsController } from './recognitions.controller';
import { OrderRequestsService } from './order-requests.service';

@Module({
  imports: [
    // Адрес callback у каждого запроса свой, поэтому общего baseURL здесь нет
    HttpModule.register({ timeout: CALLBACK_TIMEOUT_MS }),
    RecognitionModule,
    UsersModule,
  ],
  controllers: [RecognitionsController, ProposalWebhookController],
  providers: [OrderRequestsService],
})
export class OrderRequestsModule {}
