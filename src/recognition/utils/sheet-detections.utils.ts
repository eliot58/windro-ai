import {
  DETECTOR_CONFIDENCE,
  DETECTOR_IOU,
  ITEM_CHANNEL,
  SECTION_CHANNEL,
} from '../constants/handwritten.constants';
import { PixelBox } from '../recognition.types';

export interface SheetItem {
  box: PixelBox;
  sections: PixelBox[];
}

interface Candidate {
  box: PixelBox;
  score: number;
  isItem: boolean;
}

const area = (box: PixelBox) => box.width * box.height;

function intersection(a: PixelBox, b: PixelBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

const iou = (a: PixelBox, b: PixelBox) =>
  intersection(a, b) / (area(a) + area(b) - intersection(a, b));

// Какая доля рамки a лежит внутри b
const containment = (a: PixelBox, b: PixelBox) =>
  intersection(a, b) / Math.max(area(a), 1);

function suppress(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (kept.every((other) => iou(candidate.box, other.box) < DETECTOR_IOU)) {
      kept.push(candidate);
    }
  }
  return kept;
}

function verticalOverlap(a: PixelBox, b: PixelBox): number {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(0, overlap) / Math.max(Math.min(a.height, b.height), 1);
}

// Ряды сверху вниз, внутри ряда слева направо: так дилер нумерует изделия
export function sortByRows(boxes: PixelBox[]): PixelBox[] {
  const center = (box: PixelBox) => box.y + box.height / 2;
  const rows: PixelBox[][] = [];
  for (const box of [...boxes].sort(
    (a, b) => center(a) - center(b) || a.x - b.x,
  )) {
    const row = rows.find((r) =>
      r.every((other) => verticalOverlap(box, other) >= 0.5),
    );
    if (row) row.push(box);
    else rows.push([box]);
  }
  const rowCenter = (row: PixelBox[]) =>
    row.reduce((sum, box) => sum + center(box), 0) / row.length;
  return rows
    .sort((a, b) => rowCenter(a) - rowCenter(b))
    .flatMap((row) => row.sort((a, b) => a.x - b.x));
}

// Разбирает ответ детектора на изделия и их секции. При неоднозначной
// разметке возвращает null: тогда открывания на фото не проверяются
export function parseSheetDetections(
  values: Float32Array,
  count: number,
  toImage: (box: PixelBox) => PixelBox,
): SheetItem[] | null {
  const candidates: Candidate[] = [];
  for (let i = 0; i < count; i++) {
    const itemScore = values[ITEM_CHANNEL * count + i];
    const sectionScore = values[SECTION_CHANNEL * count + i];
    const score = Math.max(itemScore, sectionScore);
    if (score < DETECTOR_CONFIDENCE) continue;
    const width = values[2 * count + i];
    const height = values[3 * count + i];
    candidates.push({
      box: toImage({
        x: values[i] - width / 2,
        y: values[count + i] - height / 2,
        width,
        height,
      }),
      score,
      isItem: itemScore >= sectionScore,
    });
  }

  const items = suppress(candidates.filter((c) => c.isItem));
  const sections = suppress(candidates.filter((c) => !c.isItem)).map(
    (c) => c.box,
  );

  // Рамка изделия внутри большего изделия на деле секция, например фрамуга
  const outer: Candidate[] = [];
  for (const item of items) {
    const isSection = sections.some((s) => iou(item.box, s) >= 0.9);
    const insideLarger = items.some(
      (other) =>
        other !== item &&
        containment(item.box, other.box) > (isSection ? 0.75 : 0.85) &&
        area(other.box) > area(item.box) * 1.15,
    );
    if (!insideLarger) outer.push(item);
    else if (!sections.includes(item.box)) sections.push(item.box);
  }

  const unique: PixelBox[] = [];
  for (const item of outer.sort(
    (a, b) => b.score - a.score || area(b.box) - area(a.box),
  )) {
    if (unique.every((kept) => iou(item.box, kept) <= 0.65)) {
      unique.push(item.box);
    }
  }

  const ordered = sortByRows(unique);
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const overlap =
        intersection(ordered[i], ordered[j]) /
        Math.min(area(ordered[i]), area(ordered[j]));
      if (overlap >= 0.7) return null;
    }
  }

  return ordered.map((box) => ({
    box,
    sections: sortByRows(sections.filter((s) => containment(s, box) > 0.75)),
  }));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Какие области классифицировать в изделии: створка без импостов смотрится
// целиком, иначе секции раскладываются по колонкам между импостами.
// При любом несовпадении возвращает null
export function planOpeningCrops(
  item: Record<string, unknown>,
  sheetItem: SheetItem,
): PixelBox[] | null {
  const vImposts = (Array.isArray(item.vImposts) ? item.vImposts : []).filter(
    isObject,
  );
  const physical = sheetItem.sections;

  if (isObject(item.stvorka) && !vImposts.length) return [sheetItem.box];
  if (Array.isArray(item.hImposts) && item.hImposts.length) return null;
  if (!vImposts.length) return physical;

  const expected = vImposts.length + 1;
  const stvorkas: Array<Record<string, unknown> | undefined> = Array<
    Record<string, unknown> | undefined
  >(expected).fill(undefined);
  vImposts.forEach((impost, index) => {
    if (isObject(impost.leftStvorka)) stvorkas[index] = impost.leftStvorka;
    if (isObject(impost.rightStvorka) && !stvorkas[index + 1]) {
      stvorkas[index + 1] = impost.rightStvorka;
    }
  });
  const nested = stvorkas.map(
    (s) => Array.isArray(s?.hImposts) && s.hImposts.length > 0,
  );
  if (!nested.some(Boolean) && physical.length === expected) return physical;

  const width = Number(item.width);
  const xs = vImposts.map((impost) => Number(impost.x));
  if (
    !(width > 0) ||
    xs.some((x, i) => !(x > 0 && x < width) || (i > 0 && x <= xs[i - 1]))
  ) {
    return null;
  }

  const { box } = sheetItem;
  const bounds = [
    box.x,
    ...xs.map((x) => box.x + (box.width * x) / width),
    box.x + box.width,
  ];
  const columns: PixelBox[][] = Array.from({ length: expected }, () => []);
  for (const section of physical) {
    const center = section.x + section.width / 2;
    let column = bounds.findIndex(
      (edge, i) => i < expected && center >= edge && center < bounds[i + 1],
    );
    if (column < 0) column = center < bounds[0] ? 0 : expected - 1;
    const inside =
      Math.max(
        0,
        Math.min(section.x + section.width, bounds[column + 1]) -
          Math.max(section.x, bounds[column]),
      ) / Math.max(section.width, 1);
    // Рамка через несколько колонок это ошибка детектора: колонки покрыты другими
    if (inside < 0.6) continue;
    columns[column].push(section);
  }

  const crops: PixelBox[] = [];
  for (const [index, column] of columns.entries()) {
    if (!column.length) return null;
    if (nested[index]) {
      const x = Math.min(...column.map((s) => s.x));
      const y = Math.min(...column.map((s) => s.y));
      crops.push({
        x,
        y,
        width: Math.max(...column.map((s) => s.x + s.width)) - x,
        height: Math.max(...column.map((s) => s.y + s.height)) - y,
      });
    } else if (column.length === 1) {
      crops.push(column[0]);
    } else {
      // Детектор разбил одну секцию на куски: склеиваем, если они друг под другом
      const x = Math.min(...column.map((s) => s.x));
      const y = Math.min(...column.map((s) => s.y));
      crops.push({
        x,
        y,
        width: Math.max(...column.map((s) => s.x + s.width)) - x,
        height: Math.max(...column.map((s) => s.y + s.height)) - y,
      });
    }
  }
  return crops;
}
