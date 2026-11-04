import { registerAs } from '@nestjs/config';

import {
  DEFAULT_DOCUMENT_MODEL,
  DEFAULT_FALLBACK_MODEL,
  DEFAULT_PHOTO_MODEL,
} from './config.constants';

export default registerAs('llm', () => ({
  apiKey: process.env.LLM_API_KEY!,
  proxyUrl: process.env.LLM_PROXY_URL,
  documentModel: process.env.LLM_DOCUMENT_MODEL ?? DEFAULT_DOCUMENT_MODEL,
  photoModel: process.env.LLM_PHOTO_MODEL ?? DEFAULT_PHOTO_MODEL,
  fallbackModel: process.env.LLM_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL,
}));
