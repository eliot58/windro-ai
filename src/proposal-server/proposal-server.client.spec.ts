import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';

import { ProposalServerClient } from './proposal-server.client';

describe('ProposalServerClient', () => {
  const config = {
    url: 'http://kp.example.com',
    webhookUrl: 'https://ai.todotodo.ru/api/v1/proposals/webhook',
  };

  it('tells the proposal server where to send the PDF', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 200 }));
    const client = new ProposalServerClient(
      { post } as unknown as HttpService,
      config,
    );

    const result = await client.send('1234-5678', [{ qu: 1 }], []);

    expect(result).toEqual({ status: 'accepted' });
    expect(post).toHaveBeenCalledWith('/send_kp', {
      sellerCode: '1234-5678',
      orderItems: [{ qu: 1 }],
      url: config.webhookUrl,
    });
  });

  it('is disabled without a proposal server address', async () => {
    const client = new ProposalServerClient({} as HttpService, {
      ...config,
      url: undefined,
    });
    expect(await client.send('1234-5678', [], [])).toEqual({
      status: 'disabled',
    });
  });
});
