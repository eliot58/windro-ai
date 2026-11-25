import { OrderItem } from '../recognition.types';

export interface CloudBlock {
  cloud: string;
  items: OrderItem[];
}

// «Позиция 2», «Позиции 1–2», «Позиции 1, 3»
const POSITIONS = /(Позици\p{L}*\s+)(\d+(?:\s*(?:[–—-]|,|и)\s*\d+)*)/giu;

export const readCloud = (raw: Record<string, unknown>): string =>
  typeof raw.cloud === 'string' ? raw.cloud.trim() : '';

// Документ читается по блокам, и в каждом модель нумерует изделия с единицы.
// Переводим номера в номера итогового списка. Изделие, убранное как дубль,
// уносит с собой и пункт комментария о нём
export function mergeClouds(blocks: CloudBlock[], result: OrderItem[]): string {
  const notes = blocks.flatMap(({ cloud, items }) =>
    cloud
      .split(/;\s*/)
      .map((note) => note.trim())
      .filter(Boolean)
      .flatMap((note) => {
        let removed = false;
        const text = note.replace(
          POSITIONS,
          (_match, label: string, numbers: string) =>
            label +
            numbers.replace(/\d+/g, (local) => {
              const item = items[Number(local) - 1];
              // Номера вне блока модель взяла с чертежа, их не трогаем
              if (!item) return local;
              const index = result.indexOf(item);
              if (index < 0) removed = true;
              return String(index + 1);
            }),
        );
        return removed ? [] : [text];
      }),
  );
  return [...new Set(notes)].join('; ');
}
