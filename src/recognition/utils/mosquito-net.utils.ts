import {
  HOMOGLYPHS,
  LABEL_LOOKING,
  MC_VALUE,
  NEGATIVE_STEMS,
  NEGATIVE_WORDS,
  NET_FIELD,
  NET_TOKEN,
  PRODUCT_NAME,
  PROFSTROY_ROW,
  WORD_END,
} from '../constants/mosquito-net.constants';
import {
  Dims,
  MosquitoNet,
  MosquitoNetMap,
  Obj,
  OpenStvorka,
  OrderItem,
  Segment,
} from '../recognition.types';
import { isObject } from './guards.utils';

function parseDims(fragment: string): Dims | null {
  const match = /(\d[\d ]*)\s*[xXхХ*]\s*(\d[\d ]*)/u.exec(fragment);
  if (!match) return null;
  const width = Number(match[1].replace(/ /g, ''));
  const height = Number(match[2].replace(/ /g, ''));
  return width > 0 && height > 0 ? [width, height] : null;
}

function isNegative(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) return true;
  if (NEGATIVE_STEMS.some((stem) => text.startsWith(stem))) return true;
  return NEGATIVE_WORDS.some(
    (word) => text === word || text.startsWith(`${word} `),
  );
}

const isLabel = (line: string) =>
  LABEL_LOOKING.test(line.replace(/[aAeEoOcCTBKM]/g, (c) => HOMOGLYPHS[c]));

function hasNamedNetField(segment: string): boolean {
  const lines = segment.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const field = NET_FIELD.exec(lines[i]);
    if (field) {
      const inline = field[1].trim();
      if (inline) {
        if (!isNegative(inline)) return true;
        continue;
      }
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (next.endsWith(':') || isLabel(next) || isNegative(next)) break;
        return true;
      }
    }
    const mc = MC_VALUE.exec(lines[i]);
    if (mc) {
      const value = mc[1].trim();
      if (
        value &&
        !value.toUpperCase().startsWith('СЕТКА') &&
        !isNegative(value)
      ) {
        return true;
      }
    }
  }
  return false;
}

// Режет текст на изделия. Первое непустое разбиение по маркерам выигрывает
function itemSegments(text: string, includeDirect = true): Segment[] {
  if (includeDirect) {
    const direct = [...text.matchAll(/Изделие\s*№\s*(\d+)/gu)];
    if (direct.length) {
      return direct.map((match, k) => [
        Number(match[1]),
        text.slice(
          match.index + match[0].length,
          direct[k + 1]?.index ?? text.length,
        ),
      ]);
    }
  }

  const positions = [...text.matchAll(/^\s*Позиция\s*$/gmu)].map(
    (m) => m.index,
  );
  if (positions.length) {
    const bounds = [...positions, text.length];
    const segments: Segment[] = [];
    for (let k = 0; k + 1 < bounds.length; k++) {
      const segment = text.slice(bounds[k], bounds[k + 1]);
      const number = /^\s*№\s*(\d+)\s*$/mu.exec(segment);
      if (number) segments.push([Number(number[1]), segment]);
    }
    if (segments.length) return segments;
  }

  // Заголовок «<N>\nОкно». Число после цены или размера это ячейка таблицы
  const titles = [
    ...text.matchAll(
      new RegExp(
        `(?:^|\\n)\\s*(\\d+)\\s*\\n\\s*(?:Окно|Дверь)${WORD_END}`,
        'gu',
      ),
    ),
  ];
  const isTableCell = (position: number) => {
    const before = text.slice(0, position).replace(/\n+$/, '');
    const previous = before.slice(before.lastIndexOf('\n') + 1).trim();
    return (
      !!previous &&
      (/^[\d ]+$/u.test(previous) ||
        /^[\d ]+[.,]\d+$/u.test(previous) ||
        !!parseDims(previous))
    );
  };
  const headers = titles
    .map((m) => ({
      number: Number(m[1]),
      start: m.index + m[0].indexOf(m[1], m[0].search(/\d/u)),
    }))
    .filter((h) => !isTableCell(h.start));
  if (headers.length) {
    return headers.map((h, k) => [
      h.number,
      text.slice(h.start, headers[k + 1]?.start ?? text.length),
    ]);
  }

  // Карточка «Заказ: 1_896149/N». Нужно две и больше, иначе N может быть годом
  const cards = [
    ...text.matchAll(
      new RegExp(`Заказ:\\s*\\S+?\\/(\\d{1,3})${WORD_END}`, 'gu'),
    ),
  ];
  const numbers = cards.map((m) => Number(m[1]));
  if (cards.length >= 2 && new Set(numbers).size === numbers.length) {
    return cards.map((m, k) => [
      numbers[k],
      text.slice(m.index, cards[k + 1]?.index ?? text.length),
    ]);
  }
  return [];
}

// Номер строки спецификации: первое короткое целое после размеров
function trailingNumber(lines: string[], from: number): number | null {
  for (let k = from + 1; k < Math.min(from + 4, lines.length); k++) {
    const value = lines[k].trim();
    if (!value) continue;
    if (/^\d{1,3}$/u.test(value)) return Number(value);
    if (/^[\d ]+[.,]\d+$/u.test(value)) continue;
    break;
  }
  return null;
}

function productNumbers(lines: string[]): Set<number> {
  const numbers = new Set<number>();
  lines.forEach((line, i) => {
    if (!PRODUCT_NAME.test(line) || NET_TOKEN.test(line)) return;
    let dimsLine: number | null = parseDims(line) ? i : null;
    if (dimsLine === null) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const value = lines[j].trim();
        if (!value) continue;
        if (parseDims(value)) {
          dimsLine = j;
          break;
        }
        if (/[А-Яа-яA-Za-z]{3,}/u.test(value)) break;
      }
    }
    if (dimsLine === null) return;
    const number = trailingNumber(lines, dimsLine);
    if (number !== null) numbers.add(number);
  });
  return numbers;
}

// Границы секции «Москитные сетки» в формате ПрофСтрой: её разбирает отдельная ветка
function profstroySpan(text: string): [number, number] | null {
  const section = /^\s*Москитные\s+сетки\s*$/mu.exec(text);
  if (!section) return null;
  const sectionEnd = section.index + section[0].length;
  const tail = text.slice(sectionEnd);
  const end = new RegExp(
    `^\\s*(?:ИТОГО|Комплектующие|Комлектация)${WORD_END}`,
    'mu',
  ).exec(tail);
  let length = end ? end.index : Math.min(tail.length, 2000);

  let lastRow = 0;
  for (const row of tail.slice(0, length).matchAll(PROFSTROY_ROW)) {
    lastRow = row.index + row[0].length;
  }
  if (lastRow) length = Math.min(length, lastRow);
  return [section.index, sectionEnd + length];
}

// Строки «сетка + ШxВ + №» вне секций. Число за размерами принимается как номер
// изделия, только если такое изделие в документе есть, иначе это количество
function specRows(text: string): Array<[number, Dims]> {
  const rows: Array<[number, Dims]> = [];
  const span = profstroySpan(text);
  const lines = text.split('\n');
  const realNumbers = new Set([
    ...productNumbers(lines),
    ...itemSegments(text, false).map(([number]) => number),
  ]);

  let offset = 0;
  lines.forEach((line, i) => {
    const lineStart = offset;
    offset += line.length + 1;
    if (!NET_TOKEN.test(line)) return;
    if (span && span[0] <= lineStart && lineStart < span[1]) return;

    let dims = parseDims(line);
    let dimsLine: number | null = dims ? i : null;
    for (
      let j = i + 1;
      dimsLine === null && j < Math.min(i + 5, lines.length);
      j++
    ) {
      dims = parseDims(lines[j]);
      if (dims) dimsLine = j;
    }
    if (dimsLine === null || !dims) return;

    const number = trailingNumber(lines, dimsLine);
    if (number !== null && realNumbers.has(number)) rows.push([number, dims]);
  });
  return rows;
}

// Строит карту Изд.№ → сетки из текстового слоя документа
export function parseMosquitoNets(fullText: string): MosquitoNetMap {
  const text = fullText.replace(/[\u00a0\u2009\u202f]/g, ' ');
  const map: MosquitoNetMap = new Map();
  if (!text.trim()) return map;

  const add = (number: number, net: MosquitoNet) => {
    map.set(number, [...(map.get(number) ?? []), net]);
  };

  const section = /Москитные\s+сетки/u.exec(text);
  if (section) {
    const tail = text.slice(section.index + section[0].length);
    const end = /\n\s*ИТОГО|Комплектующие/u.exec(tail);
    const body = end ? tail.slice(0, end.index) : tail;
    for (const row of body.matchAll(PROFSTROY_ROW)) {
      const after = row.index + row[0].length;
      add(Number(row[1]), { dims: parseDims(body.slice(after, after + 120)) });
    }
  }

  const items = [...text.matchAll(/Изделие\s*№\s*(\d+)/gu)];
  items.forEach((match, i) => {
    const start = match.index + match[0].length;
    const segment = text.slice(start, items[i + 1]?.index ?? text.length);
    const token = /МС\s*СЕТКА/u.exec(segment);
    const number = Number(match[1]);
    if (!token || map.has(number)) return;
    const after = token.index + token[0].length;
    add(number, { dims: parseDims(segment.slice(after, after + 120)) });
  });

  for (const [number, segment] of itemSegments(text)) {
    if (!map.has(number) && hasNamedNetField(segment)) {
      add(number, { dims: null });
    }
  }
  for (const [number, dims] of specRows(text)) {
    if (!map.has(number)) add(number, { dims });
  }
  return map;
}

function collectOpenStvorkas(item: OrderItem): OpenStvorka[] {
  const result: OpenStvorka[] = [];
  const push = (
    stvorka: unknown,
    left: number | null,
    right: number | null,
  ) => {
    if (isObject(stvorka)) result.push({ stvorka, left, right });
  };
  const toNumber = (value: unknown) => {
    const parsed = value == null ? NaN : Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  push(item.stvorka, null, null);

  if (Array.isArray(item.vImposts)) {
    const imposts = item.vImposts as Obj[];
    const xs = imposts.map((impost) => toNumber(impost?.x));
    const itemRight = toNumber(item.width);
    imposts.forEach((impost, index) => {
      if (!isObject(impost)) return;
      const previous = index > 0 ? xs[index - 1] : 0;
      const next = index + 1 < xs.length ? xs[index + 1] : itemRight;
      push(impost.leftStvorka, previous, xs[index]);
      push(impost.rightStvorka, xs[index], next);
    });
  }

  if (Array.isArray(item.hImposts)) {
    for (const impost of (item.hImposts as unknown[]).filter(isObject)) {
      push(impost.bottomStvorka, null, null);
      push(impost.topStvorka, null, null);
      for (const key of ['bottomImposts', 'topImposts']) {
        if (!Array.isArray(impost[key])) continue;
        for (const sub of (impost[key] as unknown[]).filter(isObject)) {
          push(sub.leftStvorka, null, null);
          push(sub.rightStvorka, null, null);
        }
      }
    }
  }
  return result;
}

// Ставит isMoskit на створку изделия. При неоднозначности не ставит ничего:
// лишняя сетка в КП хуже, чем её отсутствие
export function applyMosquitoNet(
  item: OrderItem,
  nets: MosquitoNet[],
): OrderItem {
  const stvorkas = collectOpenStvorkas(item);
  if (!stvorkas.length) return item;
  if (stvorkas.some(({ stvorka }) => stvorka.isMoskit === true)) return item;

  if (stvorkas.length === 1) {
    stvorkas[0].stvorka.isMoskit = true;
    return item;
  }

  const dims = nets.find((net) => net.dims)?.dims;
  if (!dims) return item;

  const scored = stvorkas
    .filter(
      (s) =>
        s.left !== null && s.right !== null && Math.abs(s.right - s.left) > 0,
    )
    .map((s) => ({
      diff: Math.abs(Math.abs(s.right! - s.left!) - dims[0]),
      stvorka: s.stvorka,
    }))
    .sort((a, b) => a.diff - b.diff);
  if (!scored.length) return item;

  const best = scored[0];
  if (scored.length > 1 && Math.abs(scored[1].diff - best.diff) < 50) {
    // Ширины равны: сетка ставится на единственную поворотно-откидную створку
    const povOtk = scored.filter(
      (s) =>
        Math.abs(s.diff - best.diff) < 50 && s.stvorka.openType === 'povOtk',
    );
    if (povOtk.length === 1) povOtk[0].stvorka.isMoskit = true;
    return item;
  }

  best.stvorka.isMoskit = true;
  return item;
}
