import * as Joi from 'joi';

// Проверка переменных окружения при старте: без обязательных приложение не запустится
export const configSchema = Joi.object({
  // Приложение
  NODE_ENV: Joi.string().valid('production', 'development', 'test'),
  PORT: Joi.number().port().optional(),
  PUBLIC_URL: Joi.string().uri().required(),
  // openssl rand -hex 32
  API_KEY: Joi.string().hex().length(64).required(),

  // База данных
  DATABASE_URL: Joi.string()
    .uri({ scheme: [/postgresql/] })
    .required(),

  // Telegram
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  TELEGRAM_WEBHOOK_SECRET: Joi.string().required(),
  TELEGRAM_PROXY_URL: Joi.string().uri().optional(),

  // Модель распознавания
  LLM_API_KEY: Joi.string().required(),
  LLM_PROXY_URL: Joi.string().uri().optional(),
  LLM_DOCUMENT_MODEL: Joi.string().optional(),
  LLM_PHOTO_MODEL: Joi.string().optional(),
  LLM_FALLBACK_MODEL: Joi.string().optional(),

  // Без адреса сервера КП пользователь получает только распознанный JSON
  PROPOSAL_SERVER_URL: Joi.string().uri().optional(),
});
