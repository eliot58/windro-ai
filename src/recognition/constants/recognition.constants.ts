import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DOCUMENT_PROMPT = readFileSync(
  join(__dirname, '../prompts/document.txt'),
  'utf8',
);

export const PHOTO_PROMPT = readFileSync(
  join(__dirname, '../prompts/photo.txt'),
  'utf8',
);

export const DOCUMENT_USER_PROMPT =
  'Извлеки ВСЕ изделия из чертежа и таблицы на изображении. Верни JSON с orderItems.';

export const PHOTO_USER_PROMPT =
  'Извлеки ВСЕ изделия из рукописного бланка на фотографии. Лист может быть повёрнут на 90 или 180 градусов: читай его в правильной ориентации, левая и правая стороны определяются по тексту бланка. Верни JSON с orderItems.';

export const PRIMARY_MODEL_ATTEMPTS = 3;

export const RETRY_DELAY_MS = 2_000;

export const MAX_PHOTO_SIDE = 2048;

export const MAX_FEEDBACK_ERRORS = 10;

export const CONCURRENT_JOBS = 2;

export const CONCURRENT_BLOCKS = 4;
