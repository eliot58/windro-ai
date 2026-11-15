import { Bot } from 'grammy';

export interface ApiCall {
  method: string;
  payload: Record<string, unknown>;
}

// Бот без сети: запросы к Telegram не уходят, а складываются в calls
export function createTestBot() {
  const calls: ApiCall[] = [];
  const bot = new Bot('123:test', {
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: 'Windro',
      username: 'windro_test_bot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
    },
  });

  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload });
    const result = method === 'getFile' ? { file_path: 'file.bin' } : true;
    return Promise.resolve({ ok: true, result } as never);
  });

  return { bot, calls };
}

const USER = { id: 42, is_bot: false, first_name: 'User' };
const PRIVATE_CHAT = { id: 42, type: 'private', first_name: 'User' };

export function messageUpdate(message: object, chat: object = PRIVATE_CHAT) {
  return {
    update_id: 1,
    message: { message_id: 1, date: 1, from: USER, chat, ...message },
  };
}

export function textUpdate(text: string) {
  return messageUpdate({ text });
}

export function commandUpdate(command: string, chat: object = PRIVATE_CHAT) {
  return messageUpdate(
    {
      text: command,
      entities: [{ type: 'bot_command', offset: 0, length: command.length }],
    },
    chat,
  );
}

export function documentUpdate(fileName: string, fileSize = 100) {
  return messageUpdate({
    document: {
      file_id: 'file-id',
      file_unique_id: 'unique-id',
      file_name: fileName,
      file_size: fileSize,
    },
  });
}
