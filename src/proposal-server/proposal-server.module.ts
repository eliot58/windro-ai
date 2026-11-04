import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import proposalServerConfig from '../config/proposal-server.config';
import { ProposalServerClient } from './proposal-server.client';
import { PROPOSAL_TIMEOUT_MS } from './proposal-server.constants';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [proposalServerConfig.KEY],
      useFactory: ({ url }: ConfigType<typeof proposalServerConfig>) => ({
        baseURL: url,
        timeout: PROPOSAL_TIMEOUT_MS,
        // Статус разбирает клиент: ошибка сервера КП не должна быть исключением
        validateStatus: () => true,
      }),
    }),
  ],
  providers: [ProposalServerClient],
  exports: [ProposalServerClient],
})
export class ProposalServerModule {}
