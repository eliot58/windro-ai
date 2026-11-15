export const REQUEST_TTL_MS = 30 * 60 * 1000;

export const CALLBACK_TIMEOUT_MS = 30_000;

export const FILE_REQUIRED_MESSAGE = 'Файл не передан.';
export const DOCUMENT_FORMAT_MESSAGE =
  'Формат не поддерживается. Нужен PDF, DOCX или DOC.';
export const PHOTO_FORMAT_MESSAGE =
  'Формат не поддерживается. Нужно фото JPG, PNG, BMP или WEBP.';
export const BAD_CALLBACK_URL_MESSAGE =
  'callbackUrl должен начинаться с http:// или https://.';
export const REQUEST_NOT_FOUND_MESSAGE = 'Запрос не найден.';
export const INTERNAL_ERROR_MESSAGE = 'Не удалось обработать заявку.';
export const PROPOSAL_DISABLED_MESSAGE =
  'Сервер КП не настроен, отправлены только распознанные данные.';

export const notRecognizedMessage = (reason: string) =>
  `Не удалось распознать заявку: ${reason}.`;
