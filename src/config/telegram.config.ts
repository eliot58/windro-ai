import { registerAs } from '@nestjs/config';

import { TELEGRAM_WEBHOOK_PATH } from './config.constants';

export default registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  // Из РФ Telegram до сервера не достучаться, поэтому вебхук может идти через
  // зарубежного посредника, который пересылает запрос на PUBLIC_URL
  webhookUrl:
    process.env.TELEGRAM_WEBHOOK_URL ??
    `${process.env.PUBLIC_URL!}${TELEGRAM_WEBHOOK_PATH}`,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET!,
  proxyUrl: process.env.TELEGRAM_PROXY_URL,
}));
