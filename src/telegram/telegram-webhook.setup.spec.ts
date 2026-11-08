import { TelegramWebhookSetup } from './telegram-webhook.setup';

describe('TelegramWebhookSetup', () => {
  it('registers commands and sets the webhook', async () => {
    const bot = {
      api: {
        setWebhook: jest.fn().mockResolvedValue(true),
        setMyCommands: jest.fn().mockResolvedValue(true),
      },
    };
    const commands = { register: jest.fn() };
    const config = {
      webhookUrl: 'https://api.example.com/api/v1/telegram/webhook',
      webhookSecret: 'secret',
    };

    await new TelegramWebhookSetup(
      bot as never,
      config as never,
      commands as never,
    ).onModuleInit();

    expect(commands.register).toHaveBeenCalledWith(bot);
    expect(bot.api.setMyCommands).toHaveBeenCalled();
    expect(bot.api.setWebhook).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/telegram/webhook',
      {
        secret_token: 'secret',
        allowed_updates: ['message'],
        drop_pending_updates: true,
      },
    );
  });
});
