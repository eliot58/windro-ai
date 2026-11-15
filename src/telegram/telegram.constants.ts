export const TELEGRAM_BOT = 'TELEGRAM_BOT';

export const TELEGRAM_FILE_API_URL = 'https://api.telegram.org/file';

export const TELEGRAM_DOWNLOAD_TIMEOUT_MS = 60_000;

export const MIN_WINDOW_SIZE = 300;

export const SEND_ATTEMPTS = 3;

export const RETRY_DELAY_MS = 3_000;

// Меню команд в Telegram, ставится при старте
export const BOT_COMMANDS = [
  { command: 'start', description: 'Начать работу' },
  { command: 'logout', description: 'Выйти и сменить код продавца' },
  { command: 'help', description: 'Что умеет бот' },
];
