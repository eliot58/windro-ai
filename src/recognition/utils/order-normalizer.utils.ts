/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- данные приходят от модели и из XML, их форма проверяется валидатором */
import {
  COLOR_ONLY,
  DOOR_FURNITURE_MARKERS,
  EMPTY_FURNITURE,
  FURNITURE_BRANDS,
  H_FILLS,
  H_STVORKAS,
  SANDWICH_BARE,
  SANDWICH_LETTER,
  SANDWICH_WORD,
  SMALL_TRANSOM_MM,
  SUB_IMPOSTS,
  UNSUPPORTED_ARCHED_WINDOW,
  UNSUPPORTED_BEVELED_WINDOW,
  V_FILLS,
  V_STVORKAS,
  WHITE_COLORS,
} from '../constants/order.constants';
import { Obj, OrderItem } from '../recognition.types';
import { isNumber, isObject } from './guards.utils';

const objects = (value: unknown): Obj[] =>
  Array.isArray(value) ? value.filter(isObject) : [];

export const isDoor = (item: OrderItem) =>
  String(item.constructionType ?? '')
    .toLowerCase()
    .includes('дверь');

// Как round в Python: половина округляется к чётному
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

// Модель иногда отдаёт числа строками, сервер КП принимает только числа
export function coerceNumbers(item: OrderItem): OrderItem {
  const toNumber = (obj: Obj, key: string) => {
    if (typeof obj[key] !== 'string' || !obj[key].trim()) return;
    const parsed = Number(obj[key].replace(',', '.'));
    if (Number.isFinite(parsed)) obj[key] = parsed;
  };
  const walkImposts = (imposts: unknown) => {
    for (const impost of objects(imposts)) {
      toNumber(impost, 'x');
      toNumber(impost, 'y');
      for (const key of SUB_IMPOSTS) walkImposts(impost[key]);
      for (const key of [...V_STVORKAS, ...H_STVORKAS]) {
        if (isObject(impost[key])) walkImposts(impost[key].hImposts);
      }
    }
  };

  for (const key of ['width', 'height', 'qu']) toNumber(item, key);
  walkImposts(item.vImposts);
  walkImposts(item.hImposts);
  if (isObject(item.stvorka)) walkImposts(item.stvorka.hImposts);
  return item;
}

export function normalizeProfileName(
  raw: unknown,
  door = false,
  handwritten = false,
): string {
  if (typeof raw !== 'string' || !raw || raw === 'None') return '';
  let name = raw.replace(/^\s*Профиль[\s:.-]+(?=\S)/iu, '');
  // В рукописном бланке бренд значим: «70» без него неоднозначно
  if (!door && !handwritten)
    name = name.replace(/^[Rr][Ee][Hh][Aa][Uu]\s+/, '');
  if (!door && name.includes(' / ')) {
    const parts = name.split(' / ');
    const last = parts[parts.length - 1].trim();
    // Латиница или цифры значат систему профиля, одна кириллица значит цвет
    name = /[A-Za-z0-9]/.test(last)
      ? last
      : parts.slice(0, -1).join(' / ').trim();
  }
  name = name
    .replace(/\s*\/\s*(?:белы[йя]|белая\s*основа|white)\s*$/iu, '')
    .replace(/\s*[Aa][Ee][Rr][Oo]\s*/g, ' ')
    .trim()
    .replace(/\s+\d+\.\d+(?:\s+.*)?$/su, '')
    .replace(/\s+[A-Z]{2,}\d.*$/su, '')
    .replace(/\s+/g, ' ')
    .trim();
  return COLOR_ONLY.test(name) ? '' : name;
}

export function normalizeFurnitureName(
  raw: unknown,
  door: boolean,
  pageText = '',
): string {
  if (typeof raw !== 'string' || !raw || EMPTY_FURNITURE.has(raw)) return '';
  let name = raw.replace(/_/g, ' ');
  if (name.startsWith('Фурнитура ')) name = name.slice('Фурнитура '.length);

  const bare = name.trim().replace(/\.+$/, '').toLowerCase();
  if (FURNITURE_BRANDS[bare]) return FURNITURE_BRANDS[bare];

  if (door) {
    for (const marker of DOOR_FURNITURE_MARKERS) {
      const index = name.indexOf(marker);
      if (index > 0) name = name.slice(0, index).trim();
    }
  }
  // Серия Roto определяется по D-кодам в тексте страницы
  if (
    !door &&
    /^Roto$/i.test(name) &&
    pageText &&
    /(?<![\p{L}\p{N}_])(?:D15|D12)(?![\p{L}\p{N}_])|40°|43°/u.test(pageText)
  ) {
    name = 'Roto NT';
  }
  return name;
}

function normalizeFill(raw: string): string {
  let fill = raw.replace(/\s*СП\/п\s*/gu, '').replace(/\s*ст\/п\s*/giu, '');

  // «40 (4-14-4-14-4И)» содержит формулу в скобках
  const formula = /^\d+(?:мм)?\s*(?:\(\d+\)\s*)?\(([^)]+)\)\s*$/u.exec(fill);
  if (formula) fill = formula[1];
  else fill = fill.replace(/^\d+(?:мм)?\s+(?:\(\d+\)\s+)?(?=\d+[МмMx-])/u, '');

  return fill
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/(\d)M(\d)/g, '$1М$2')
    .replace(/(\d)\s*[хХ]\s*(?=\d)/gu, '$1x')
    .trim();
}

// Любое обозначение сэндвича приводится к "S". В шапке бланка форма «С 32»
// может быть толщиной стеклопакета, поэтому там allowLetterForm выключен
export function normalizeSectionFill(
  value: unknown,
  allowLetterForm = true,
): unknown {
  if (typeof value !== 'string' || !value.trim()) return value;
  const raw = value.trim();
  if (SANDWICH_WORD.test(raw) || SANDWICH_BARE.test(raw)) return 'S';
  if (allowLetterForm && SANDWICH_LETTER.test(raw)) return 'S';
  return normalizeFill(raw);
}

// Обходит все импосты и створки изделия, включая вложенные
function walkStructure(
  item: OrderItem,
  visit: (obj: Obj, fillKeys: string[]) => void,
) {
  const walkStvorka = (stvorka: unknown) => {
    if (!isObject(stvorka)) return;
    visit(stvorka, ['fill']);
    walkImposts(stvorka.hImposts, H_FILLS, H_STVORKAS);
  };
  const walkImposts = (
    imposts: unknown,
    fillKeys: string[],
    stvorkaKeys: string[],
  ) => {
    for (const impost of objects(imposts)) {
      visit(impost, fillKeys);
      for (const key of stvorkaKeys) walkStvorka(impost[key]);
      for (const key of SUB_IMPOSTS) {
        walkImposts(impost[key], V_FILLS, V_STVORKAS);
      }
    }
  };

  walkStvorka(item.stvorka);
  walkImposts(item.vImposts, V_FILLS, V_STVORKAS);
  walkImposts(item.hImposts, H_FILLS, H_STVORKAS);
}

export function normalizeFillsInStructure(item: OrderItem): OrderItem {
  walkStructure(item, (obj, fillKeys) => {
    for (const key of fillKeys) {
      if (key in obj) obj[key] = normalizeSectionFill(obj[key]);
    }
  });
  return item;
}

// Карточка <name>Param нужна только сэндвичу: цвета панели не помещаются в строку "S"
export function applyFillParams(item: OrderItem): OrderItem {
  const colorIn: unknown = item.colorIn ?? '';
  const colorOut: unknown = item.colorOut ?? '';

  const build = (value: string, existing: unknown): Obj | null => {
    const current = isObject(existing) ? existing : {};
    const hasModelColors = 'colorIn' in current || 'colorOut' in current;
    if (value !== 'S' && !hasModelColors) return null;
    const param: Obj = { ...current, marking: value };
    if (value === 'S') {
      param.colorIn ??= colorIn;
      param.colorOut ??= colorOut;
    }
    return param;
  };

  const withParams = (obj: Obj, fillKeys: string[]) => {
    const rebuilt: Obj = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key.endsWith('Param') && fillKeys.includes(key.slice(0, -5))) {
        continue;
      }
      rebuilt[key] = value;
      if (fillKeys.includes(key) && typeof value === 'string' && value.trim()) {
        const param = build(value.trim(), obj[`${key}Param`]);
        if (param) rebuilt[`${key}Param`] = param;
      }
    }
    for (const key of Object.keys(obj)) delete obj[key];
    Object.assign(obj, rebuilt);
  };

  withParams(item, ['fill']);
  walkStructure(item, withParams);
  return item;
}

export function validateColors(item: OrderItem): OrderItem {
  const colorIn = item.colorIn;
  const colorOut = item.colorOut;
  if (
    !colorIn ||
    !colorOut ||
    typeof colorIn !== 'string' ||
    typeof colorOut !== 'string'
  ) {
    return item;
  }

  const lowerIn = colorIn.toLowerCase();
  const lowerOut = colorOut.toLowerCase();
  const stripSide = (color: string) =>
    color.replace(/\s*(изнутри|снаружи)\s*/gu, '');
  const base = stripSide(colorIn);

  // Одна ламинация на обе стороны: почти всегда она только снаружи
  if (
    base === stripSide(colorOut) &&
    !WHITE_COLORS.has(base.toLowerCase()) &&
    /снаружи|изнутри/u.test(lowerIn + lowerOut)
  ) {
    item.colorIn = 'W';
    if (lowerOut.includes('изнутри')) {
      item.colorOut = colorOut.replace(/изнутри/giu, 'снаружи');
    }
    return item;
  }

  const swapped =
    (lowerIn.includes('снаружи') && !lowerOut.includes('снаружи')) ||
    (lowerOut.includes('изнутри') && !lowerIn.includes('изнутри')) ||
    (WHITE_COLORS.has(lowerOut) && !WHITE_COLORS.has(lowerIn));
  if (swapped) {
    item.colorIn = colorOut;
    item.colorOut = colorIn;
  }

  item.colorOut = String(item.colorOut).replace(/изнутри/giu, 'снаружи');
  item.colorIn = String(item.colorIn).replace(/снаружи/giu, 'изнутри');
  return item;
}

const impostsOutside = (imposts: unknown, axis: string, size: number) =>
  objects(imposts).some((i) => isNumber(i[axis]) && i[axis] >= size);

// Дверь всегда выше, чем шире. У окна ширину и высоту выдают импосты:
// если они не помещаются в раму, а после перестановки помещаются, размеры перепутаны
export function fixSwappedDimensions(item: OrderItem): OrderItem {
  const width = Number(item.width);
  const height = Number(item.height);
  if (!width || !height || width === height) return item;

  const swap = () => {
    item.width = height;
    item.height = width;
  };

  if (isDoor(item)) {
    if (width > height) swap();
    return item;
  }

  const vImposts = [
    ...objects(item.vImposts),
    ...objects(item.hImposts).flatMap((h) =>
      SUB_IMPOSTS.flatMap((key) => objects(h[key])),
    ),
  ];
  const fitsNow =
    !impostsOutside(vImposts, 'x', width) &&
    !impostsOutside(item.hImposts, 'y', height);
  const fitsSwapped =
    !impostsOutside(vImposts, 'x', height) &&
    !impostsOutside(item.hImposts, 'y', width);
  if (!fitsNow && fitsSwapped) swap();
  return item;
}

export function stripSmallDoorTransoms(item: OrderItem): OrderItem {
  const stvorka: unknown = item.stvorka;
  const height = Number(item.height);
  if (!isObject(stvorka) || !stvorka.hImposts?.length || !(height > 0)) {
    return item;
  }
  const kept = objects(stvorka.hImposts).filter((impost) => {
    const y = Number(impost.y ?? 0);
    return Math.min(y, height - y) >= SMALL_TRANSOM_MM;
  });
  if (kept.length) stvorka.hImposts = kept;
  else delete stvorka.hImposts;
  return item;
}

export function fixOpenSides(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(fixOpenSides);
  } else if (isObject(value)) {
    if ('openSide' in value && !['left', 'right'].includes(value.openSide)) {
      value.openSide = 'left';
    }
    Object.values(value).forEach(fixOpenSides);
  }
}

// rightStvorka[i] и leftStvorka[i+1] описывают одну секцию, канон это левая
function shiftStvorkas(imposts: Obj[]) {
  for (let i = 0; i + 1 < imposts.length; i++) {
    if (!('rightStvorka' in imposts[i])) continue;
    if (!('leftStvorka' in imposts[i + 1])) {
      imposts[i + 1].leftStvorka = imposts[i].rightStvorka;
    }
    delete imposts[i].rightStvorka;
  }
}

export function normalizeStvorkaPositions(item: OrderItem): OrderItem {
  shiftStvorkas(objects(item.vImposts));
  for (const impost of objects(item.hImposts)) {
    for (const key of SUB_IMPOSTS) shiftStvorkas(objects(impost[key]));
  }
  return item;
}

const pickHorizontal = (source: Obj): Obj => {
  const impost: Obj = { y: source.y };
  for (const key of H_STVORKAS) {
    if (isObject(source[key])) impost[key] = source[key];
  }
  return impost;
};

// Сервер КП падает на импосте без своей координаты. Модель иногда кладёт
// горизонтальный импост в слот вертикальных и наоборот, такие записи переносятся
export function normalizeImpostStructure(item: OrderItem): OrderItem {
  const lifted: Obj[] = [];
  const movedVertical: Obj[] = [];
  const byY = (a: Obj, b: Obj) => Number(a.y ?? 0) - Number(b.y ?? 0);

  if (Array.isArray(item.hImposts)) {
    const clean: Obj[] = [];
    for (const impost of objects(item.hImposts)) {
      for (const key of SUB_IMPOSTS) {
        if (!Array.isArray(impost[key])) continue;
        const kept: Obj[] = [];
        for (const sub of objects(impost[key])) {
          if (isNumber(sub.x)) kept.push(sub);
          else if (isNumber(sub.y)) lifted.push(pickHorizontal(sub));
        }
        if (kept.length) impost[key] = kept;
        else delete impost[key];
      }
      if (isNumber(impost.y)) clean.push(impost);
      else if (isNumber(impost.x)) movedVertical.push({ x: impost.x });
    }
    clean.push(...lifted);
    if (clean.length) item.hImposts = clean.sort(byY);
    else delete item.hImposts;
  }

  if (Array.isArray(item.vImposts)) {
    const kept: Obj[] = [];
    for (const impost of objects(item.vImposts)) {
      if (isNumber(impost.x)) {
        kept.push(impost);
      } else if (isNumber(impost.y)) {
        item.hImposts ??= [];
        item.hImposts.push(pickHorizontal(impost));
      }
    }
    item.vImposts = [...kept, ...movedVertical];
  } else if (movedVertical.length) {
    item.vImposts = movedVertical;
  }

  if (Array.isArray(item.hImposts)) item.hImposts.sort(byY);
  return item;
}

// Ищет «Изд.в констр.: N,00шт.» и общую ширину «Изделие №N WxH»
export function detectComposite(
  pageText: string,
  blockNumber: number,
): { count: number; totalWidth: number | null } {
  const match =
    /Изд\.?\s*в\s*констр\.?\s*:?\s*(\d+)[,.]0*\s*шт/iu.exec(pageText) ??
    /изд(?:елий)?\s*в\s*конструкц[\p{L}\p{N}_]*\s*:?\s*(\d+)/iu.exec(pageText);
  const count = match ? Number(match[1]) : 1;
  if (count <= 1) return { count: 1, totalWidth: null };

  const dims = new RegExp(
    `Изделие\\s*№\\s*${blockNumber}\\s+(\\d+)\\s*x\\s*(\\d+)`,
    'u',
  ).exec(pageText);
  return { count, totalWidth: dims ? Number(dims[1]) : null };
}

// Приводит составную конструкцию к одному изделию: делит ширину и отбрасывает чужие импосты
export function decomposeComposite(
  item: OrderItem,
  unitCount: number,
): OrderItem {
  const total = Number(item.width ?? 0);
  if (total <= 0 || unitCount <= 1) return item;

  const unitWidth = roundHalfEven(total / unitCount);
  item.width = unitWidth;

  const insideUnit = (impost: Obj) => Number(impost.x ?? 0) < unitWidth;
  if ('vImposts' in item)
    item.vImposts = objects(item.vImposts).filter(insideUnit);

  for (const impost of objects(item.hImposts)) {
    for (const key of ['bottomImposts', 'topImposts']) {
      const subs = objects(impost[key]);
      if (!subs.length) continue;
      const filtered = subs.filter(insideUnit);
      if (filtered.length) {
        impost[key] = filtered;
        continue;
      }
      const perUnit = Math.floor(subs.length / unitCount);
      impost[key] = subs.slice(0, perUnit).map((sub) => {
        const x = Number(sub.x ?? 0);
        return x > unitWidth
          ? { ...sub, x: roundHalfEven(x % unitWidth) || unitWidth }
          : sub;
      });
    }
  }
  return item;
}

export function roundCoordinates(item: OrderItem): OrderItem {
  const ceil = (obj: Obj, key: string) => {
    if (isNumber(obj[key]) && obj[key] !== 0) obj[key] = Math.ceil(obj[key]);
  };
  ceil(item, 'width');
  ceil(item, 'height');
  for (const impost of objects(item.vImposts)) ceil(impost, 'x');
  for (const impost of objects(item.hImposts)) {
    ceil(impost, 'y');
    for (const key of SUB_IMPOSTS) {
      for (const sub of objects(impost[key])) ceil(sub, 'x');
    }
  }
  return item;
}

export function isNonstandard(item: OrderItem): boolean {
  return /скос|арочн|арка/u.test(
    String(item.constructionType ?? '')
      .toLowerCase()
      .replace(/a/g, 'а'),
  );
}

// Скосы и арки сервер КП считать не умеет, вместо них уходит код ошибки
export function replaceNonstandard(items: OrderItem[]): OrderItem[] {
  return items.map((item) => {
    if (!isNonstandard(item)) return item;
    const type = String(item.constructionType).toLowerCase().replace(/a/g, 'а');
    return {
      error: type.includes('скос')
        ? UNSUPPORTED_BEVELED_WINDOW
        : UNSUPPORTED_ARCHED_WINDOW,
    };
  });
}

// Сканы: одно изделие бывает на чертеже и в ценовой таблице разных страниц.
// Изделия одного блока дублями не считаются, даже с одинаковыми размерами
export function deduplicateAcrossBlocks(blocks: OrderItem[][]): OrderItem[] {
  const seen: Array<{ block: number; door: boolean; a: number; b: number }> =
    [];
  const unique: OrderItem[] = [];

  blocks.forEach((items, block) => {
    for (const item of items) {
      const width = Math.trunc(Number(item.width ?? 0));
      const height = Math.trunc(Number(item.height ?? 0));
      const a = Math.min(width, height);
      const b = Math.max(width, height);
      const door = isDoor(item);
      const duplicate = seen.some(
        (s) =>
          s.block !== block &&
          s.door === door &&
          Math.abs(a - s.a) <= 15 &&
          Math.abs(b - s.b) <= 15,
      );
      if (duplicate) continue;
      unique.push(item);
      seen.push({ block, door, a, b });
    }
  });
  return unique;
}
