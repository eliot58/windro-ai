import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

import { MAX_TOKENS } from './constants/llm.constants';
import { ChatResponse, VisionRequest } from './recognition.types';
import { parseJsonResponse } from './utils/llm-response.utils';

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  constructor(private readonly http: HttpService) {}

  // Возвращает разобранный JSON или null: решение о повторе принимает вызывающий
  async extract(
    request: VisionRequest,
  ): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<ChatResponse>('/chat/completions', {
          model: request.model,
          temperature: 0,
          max_tokens: MAX_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: request.userPrompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${request.image.toString('base64')}`,
                  },
                },
              ],
            },
          ],
        }),
      );

      const content = data.choices?.[0]?.message?.content;
      const parsed = content ? parseJsonResponse(content) : null;
      if (!parsed) this.logger.warn(`${request.model}: ответ не разобран`);
      return parsed;
    } catch (error) {
      const { response, code } = error as AxiosError;
      const message = response?.status ?? code ?? String(error);
      this.logger.error(`${request.model}: запрос не удался: ${message}`);
      return null;
    }
  }
}
