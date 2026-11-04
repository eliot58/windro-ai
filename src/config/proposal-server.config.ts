import { registerAs } from '@nestjs/config';

export default registerAs('proposalServer', () => ({
  url: process.env.PROPOSAL_SERVER_URL,
}));
