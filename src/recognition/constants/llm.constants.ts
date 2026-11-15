export const LLM_BASE_URL = 'https://openrouter.ai/api/v1';

export const LLM_TIMEOUT_MS = 180_000;

// Reasoning-модели тратят тысячи токенов до JSON, при малом лимите ответ обрывается
export const MAX_TOKENS = 16_384;
