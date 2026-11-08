import { FILE_TOO_LARGE_MESSAGE } from '../common/common.constants';

// Сообщения команд отправляются с parse_mode HTML, см. replyTo
export const WELCOME_MESSAGE = [
  '👋 <b>Добро пожаловать!</b>',
  '',
  'Бот готовит коммерческие предложения по заявкам на окна.',
  '',
  '🔑 Чтобы начать, отправьте код продавца.',
  'Пример: <code>1234-5678</code>',
].join('\n');
export const BAD_SELLER_CODE_MESSAGE = [
  '❌ <b>Неверный формат кода</b>',
  '',
  'Пример: <code>1234-5678</code>',
].join('\n');
export const SEND_ORDER_MESSAGE = [
  '📄 <b>Отправьте заявку</b>',
  '',
  'Подойдёт:',
  '• PDF, DOCX или DOC',
  '• фото бланка',
  '',
  '📎 Фото лучше отправлять файлом.',
].join('\n');
export const ACTIVATED_MESSAGE = `✅ <b>Код принят</b>\n\n${SEND_ORDER_MESSAGE}`;
export const NOT_ACTIVATED_MESSAGE = [
  '🔒 <b>Нужен код продавца</b>',
  '',
  'Отправьте /start, чтобы начать.',
].join('\n');
export const LOGOUT_MESSAGE = [
  '👋 <b>Вы вышли</b>',
  '',
  'Чтобы вернуться, отправьте /start.',
].join('\n');
export const HELP_MESSAGE = [
  'ℹ️ <b>Что умеет бот</b>',
  '',
  'Распознаёт заявку на окна и присылает коммерческое предложение.',
  'Подойдёт PDF, DOCX, DOC или фото бланка.',
  '',
  '<b>Команды</b>',
  '/start — начать работу',
  '/logout — выйти и сменить код продавца',
  '/help — эта справка',
].join('\n');
export const PROCESSING_MESSAGE = '⏳ Обрабатываю заявку...';
export const PROCESSING_ERROR_MESSAGE =
  '❌ Не удалось обработать заявку. Попробуйте ещё раз.';
export const UNSUPPORTED_FORMAT_MESSAGE =
  '❌ Формат не поддерживается. Нужен PDF, DOCX, DOC или фото.';
export const PHOTO_HINT_MESSAGE =
  '💡 Чтобы фото читалось лучше, отправьте его файлом: 📎 → Файл.';
export const RESULT_CAPTION = 'Распознанные данные';

export const FILE_TOO_LARGE_ERROR_MESSAGE = `❌ ${FILE_TOO_LARGE_MESSAGE}`;

export const PROPOSAL_READY_MESSAGE = 'КП готово';
export const PROPOSAL_CAPTION = 'Коммерческое предложение';
export const PROPOSAL_ORDER_ERROR_MESSAGE =
  '❌ Не удалось заказать КП: сервер не отвечает.';
export const PROPOSAL_FAILED_MESSAGE = '❌ Не удалось создать КП.';
export const PROPOSAL_SEND_ERROR_MESSAGE =
  '❌ Не удалось отправить КП. Отправьте заявку ещё раз.';

export const notRecognizedMessage = (reason: string) =>
  `❌ Не удалось распознать заявку: ${reason}.`;
export const badSizeMessage = (items: string[], minSize: number) =>
  `❌ Размер окна меньше ${minSize} мм: ${items.join(', ')}.`;
export const proposalErrorMessage = (message: string, code: string) =>
  `❌ ${message}\n\nКод ошибки: ${code}`;
