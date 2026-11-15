import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { proxyOptions } from '../common/http.utils';
import llmConfig from '../config/llm.config';
import { LLM_BASE_URL, LLM_TIMEOUT_MS } from './constants/llm.constants';
import { DocumentReader } from './document-reader';
import { HandwrittenOpeningsService } from './handwritten-openings.service';
import { LlmClient } from './llm.client';
import { OpeningClassifierService } from './opening-classifier.service';
import { RecognitionService } from './recognition.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [llmConfig.KEY],
      useFactory: ({ apiKey, proxyUrl }: ConfigType<typeof llmConfig>) => ({
        baseURL: LLM_BASE_URL,
        timeout: LLM_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${apiKey}` },
        ...proxyOptions(proxyUrl),
      }),
    }),
  ],
  providers: [
    DocumentReader,
    HandwrittenOpeningsService,
    LlmClient,
    OpeningClassifierService,
    RecognitionService,
  ],
  exports: [RecognitionService],
})
export class RecognitionModule {}
