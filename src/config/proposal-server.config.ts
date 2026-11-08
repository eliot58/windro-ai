import { registerAs } from '@nestjs/config';

import { PROPOSAL_WEBHOOK_PATH } from './config.constants';

export default registerAs('proposalServer', () => ({
  url: process.env.PROPOSAL_SERVER_URL,
  webhookUrl: `${process.env.PUBLIC_URL!}${PROPOSAL_WEBHOOK_PATH}`,
}));
