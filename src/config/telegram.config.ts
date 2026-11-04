import { registerAs } from '@nestjs/config';

import { TELEGRAM_WEBHOOK_PATH } from './config.constants';

export default registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  webhookUrl: `${process.env.PUBLIC_URL!}${TELEGRAM_WEBHOOK_PATH}`,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET!,
  proxyUrl: process.env.TELEGRAM_PROXY_URL,
}));
