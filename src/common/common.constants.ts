const MAX_FILE_SIZE_MB = 20;

export const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.doc'];

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];

export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export const SELLER_CODE = /^\d{4}-\d{4}$/;

export const FILE_TOO_LARGE_MESSAGE = `Файл больше ${MAX_FILE_SIZE_MB} МБ.`;

export const API_KEY_HEADER = 'x-api-key';

export const API_KEY_SECURITY = 'api-key';

export const INVALID_API_KEY_MESSAGE = 'Неверный ключ API.';
