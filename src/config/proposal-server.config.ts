import { registerAs } from '@nestjs/config';

import { PROPOSAL_WEBHOOK_PATH } from './config.constants';

export default registerAs('proposalServer', () => ({
  url: process.env.PROPOSAL_SERVER_URL,
  // Программа КП на старой Windows не подключается по HTTPS, поэтому адрес
  // для ответа можно задать отдельно, например http://<IP>/api/v1/proposals/webhook
  webhookUrl:
    process.env.PROPOSAL_WEBHOOK_URL ??
    `${process.env.PUBLIC_URL!}${PROPOSAL_WEBHOOK_PATH}`,
}));
