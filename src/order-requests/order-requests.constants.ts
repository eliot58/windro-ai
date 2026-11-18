export const CALLBACK_TIMEOUT_MS = 30_000;

// Расширение по типу файла: фронтенд может прислать файл без расширения в имени
export const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'image/jpeg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const FILE_REQUIRED_MESSAGE = 'Файл не передан.';
export const UNSUPPORTED_FORMAT_MESSAGE =
  'Формат не поддерживается. Нужен PDF, DOC, DOCX, JPG, PNG или WEBP.';
export const BAD_CALLBACK_URL_MESSAGE =
  'callback_url должен начинаться с http:// или https://.';
export const INTERNAL_ERROR_MESSAGE = 'Не удалось обработать заявку.';

export const notRecognizedMessage = (reason: string) =>
  `Не удалось распознать заявку: ${reason}.`;
