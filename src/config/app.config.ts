import { registerAs } from '@nestjs/config';

import { DEFAULT_PORT } from './config.constants';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV!,
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  apiKey: process.env.API_KEY!,
}));
