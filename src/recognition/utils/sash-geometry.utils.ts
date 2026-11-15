import { PixelBox, RawImage } from '../recognition.types';
import { morph, unionBox } from './glass-sections.utils';

const DARK = 90;
const LINE = 170;
const LINE_WINDOW = 4;
const LINE_CONTRAST = 60;
const FRAME_RADIUS = 3;
const MIN_FRAME_SIDE = 60;
const FRAME_GAP = 30;
const LINE_TOLERANCE = 2;
const LINE_STEPS = 60;
const STRONG_LINE = 0.6;
const WEAK_LINE = 0.3;

const grayAt = (image: RawImage, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 255;
  const i = (y * image.width + x) * 3;
  return (
    (image.data[i] * 299 + image.data[i + 1] * 587 + image.data[i + 2] * 114) /
    1000
  );
};

// Рама изделия — самая крупная толстая тёмная рамка: тонкие линии таблиц и текст
// исчезают после сужения маски
function findFrame(image: RawImage): PixelBox | undefined {
  const { width, height } = image;
  let mask: Uint8Array = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      mask[y * width + x] = grayAt(image, x, y) < DARK ? 1 : 0;
  mask = morph(mask, width, height, FRAME_RADIUS, 0);

  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const rings: PixelBox[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let [x0, y0, x1, y1, count] = [width, height, 0, 0, 0];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      count++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const next of [i - 1, i + 1, i - width, i + width]) {
        if (next < 0 || next >= mask.length || seen[next] || !mask[next])
          continue;
        if (Math.abs((next % width) - x) > 1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    const box = { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    if (box.width < MIN_FRAME_SIDE / 2 || box.height < MIN_FRAME_SIDE / 2)
      continue;
    // Рама — кольцо, а не залитый прямоугольник
    if (count / (box.width * box.height) > 0.5) continue;
    rings.push(box);
  }
  return mergeStacked(rings)
    .filter(
      (box) => box.width >= MIN_FRAME_SIDE && box.height >= MIN_FRAME_SIDE,
    )
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) /
  Math.max(1, Math.min(a1 - a0, b1 - b0));

// Импост делит раму на несколько колец: склеиваем соседние кольца одной ширины или высоты
function mergeStacked(boxes: PixelBox[]): PixelBox[] {
  const result = [...boxes];
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < result.length && !merged; i++)
      for (let j = i + 1; j < result.length && !merged; j++) {
        const a = result[i];
        const b = result[j];
        const [ax1, ay1] = [a.x + a.width, a.y + a.height];
        const [bx1, by1] = [b.x + b.width, b.y + b.height];
        const gapY = Math.max(a.y, b.y) - Math.min(ay1, by1);
        const gapX = Math.max(a.x, b.x) - Math.min(ax1, bx1);
        const vertical = overlap(a.x, ax1, b.x, bx1) > 0.8 && gapY < FRAME_GAP;
        const horizontal =
          overlap(a.y, ay1, b.y, by1) > 0.8 && gapX < FRAME_GAP;
        if (!vertical && !horizontal) continue;
        result[i] = unionBox([a, b]);
        result.splice(j, 1);
        merged = true;
      }
  }
  return result;
}

const median = (values: number[]) =>
  values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Внутренний край рамы: идём от внешнего края внутрь, пока не кончится тёмное
function findInterior(image: RawImage, frame: PixelBox): PixelBox | undefined {
  const pad = FRAME_RADIUS + 2;
  const x0 = Math.max(frame.x - pad, 0);
  const y0 = Math.max(frame.y - pad, 0);
  const x1 = Math.min(frame.x + frame.width + pad, image.width - 1);
  const y1 = Math.min(frame.y + frame.height + pad, image.height - 1);
  const limit = Math.floor(Math.min(x1 - x0, y1 - y0) / 3);

  const inner = (
    from: number,
    step: number,
    read: (position: number) => number,
  ): number | undefined => {
    let position = from;
    let inside = false;
    for (let i = 0; i < limit; i++, position += step) {
      const dark = read(position) < DARK;
      if (dark) inside = true;
      else if (inside) return position;
    }
    return undefined;
  };

  const sides = { left: [], right: [], top: [], bottom: [] } as Record<
    string,
    number[]
  >;
  for (const ratio of [0.3, 0.4, 0.6, 0.7]) {
    const y = Math.round(y0 + (y1 - y0) * ratio);
    const x = Math.round(x0 + (x1 - x0) * ratio);
    const left = inner(x0, 1, (p) => grayAt(image, p, y));
    const right = inner(x1, -1, (p) => grayAt(image, p, y));
    const top = inner(y0, 1, (p) => grayAt(image, x, p));
    const bottom = inner(y1, -1, (p) => grayAt(image, x, p));
    if (left !== undefined) sides.left.push(left);
    if (right !== undefined) sides.right.push(right);
    if (top !== undefined) sides.top.push(top);
    if (bottom !== undefined) sides.bottom.push(bottom);
  }
  if (Object.values(sides).some((values) => values.length < 2)) return;

  const left = median(sides.left);
  const right = median(sides.right);
  const top = median(sides.top);
  const bottom = median(sides.bottom);
  if (right - left < MIN_FRAME_SIDE / 2 || bottom - top < MIN_FRAME_SIDE / 2)
    return;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Линия темнее фона вокруг себя: заливка стекла любого цвета линией не считается
function isLinePixel(image: RawImage, x: number, y: number): boolean {
  const value = grayAt(image, x, y);
  if (value >= LINE) return false;
  let background = 0;
  for (let d = -LINE_WINDOW; d <= LINE_WINDOW; d++)
    background = Math.max(
      background,
      Math.min(grayAt(image, x + d, y), grayAt(image, x, y + d)),
    );
  return background - value >= LINE_CONTRAST;
}

// Маска линий в области рамы, расширенная на допуск, чтобы проверять точку за одно чтение
function buildLineMask(image: RawImage, area: PixelBox): Uint8Array {
  let mask: Uint8Array = new Uint8Array(area.width * area.height);
  for (let y = 0; y < area.height; y++)
    for (let x = 0; x < area.width; x++)
      mask[y * area.width + x] = isLinePixel(image, area.x + x, area.y + y)
        ? 1
        : 0;
  mask = morph(mask, area.width, area.height, LINE_TOLERANCE, 1);
  return mask;
}

type Point = [number, number];

// Доля точек отрезка, рядом с которыми есть линия
function lineScore(
  mask: Uint8Array,
  area: PixelBox,
  from: Point,
  to: Point,
): number {
  let hits = 0;
  for (let i = 0; i <= LINE_STEPS; i++) {
    const t = 0.3 + (0.55 * i) / LINE_STEPS;
    const x = Math.round(from[0] + (to[0] - from[0]) * t) - area.x;
    const y = Math.round(from[1] + (to[1] - from[1]) * t) - area.y;
    if (x < 0 || y < 0 || x >= area.width || y >= area.height) continue;
    hits += mask[y * area.width + x];
  }
  return hits / (LINE_STEPS + 1);
}

// Лучшая пара линий от вершины на одной стороне к углам стекла на другой.
// Концы ищем перебором: подписи и панели сдвигают видимые углы
function triangleScore(
  mask: Uint8Array,
  area: PixelBox,
  apexX: number,
  farX: number,
  frame: PixelBox,
  box: PixelBox,
): number {
  const span = box.height;
  const middle = frame.y + frame.height / 2;
  let best = 0;
  for (let dy = -0.08; dy <= 0.08; dy += 0.01) {
    const apex: Point = [apexX, Math.round(middle + dy * span)];
    let top = 0;
    let bottom = 0;
    for (let ratio = 0; ratio <= 0.25; ratio += 0.005) {
      const offset = Math.round(ratio * span);
      top = Math.max(top, lineScore(mask, area, apex, [farX, box.y + offset]));
      bottom = Math.max(
        bottom,
        lineScore(mask, area, apex, [farX, box.y + box.height - offset]),
      );
    }
    best = Math.max(best, Math.min(top, bottom));
  }
  return best;
}

// Сторона вершины бокового треугольника створки на чертеже одного изделия.
// Вершина показывает ручку, поэтому петли с противоположной стороны
export function findSashApex(image: RawImage): 'left' | 'right' | undefined {
  const frame = findFrame(image);
  if (!frame) return;
  const box = findInterior(image, frame);
  if (!box) return;

  const mask = buildLineMask(image, frame);
  const inset = 3;
  const frameLeft = Math.round((frame.x + box.x) / 2);
  const frameRight = Math.round(
    (frame.x + frame.width + box.x + box.width) / 2,
  );
  const left = triangleScore(
    mask,
    frame,
    frameLeft,
    box.x + box.width - inset,
    frame,
    box,
  );
  const right = triangleScore(
    mask,
    frame,
    frameRight,
    box.x + inset,
    frame,
    box,
  );

  if (left >= STRONG_LINE && right <= WEAK_LINE) return 'left';
  if (right >= STRONG_LINE && left <= WEAK_LINE) return 'right';
  return undefined;
}
