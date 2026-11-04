import { Context } from 'grammy';

import { OrderItem } from '../recognition/recognition.types';
import { MIN_WINDOW_SIZE } from './telegram.constants';

export function findBadWindowSizes(items: OrderItem[]): string[] {
  const bad: string[] = [];
  items.forEach((item, index) => {
    if (item.constructionType !== 'Окно') return;
    const width = Number(item.width ?? 0);
    const height = Number(item.height ?? 0);
    if (width < MIN_WINDOW_SIZE || height < MIN_WINDOW_SIZE) {
      bad.push(`#${index + 1} (${width}×${height})`);
    }
  });
  return bad;
}

export const replyTo = (ctx: Context, text: string) =>
  ctx.reply(text, {
    parse_mode: 'HTML',
    reply_parameters: { message_id: ctx.message!.message_id },
  });
