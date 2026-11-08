import {
  OVERRIDE_CONFIDENCE,
  STRUCTURE_CONFIDENCE,
} from '../constants/opening.constants';

export interface OpeningThresholds {
  override: number;
  add: number;
  remove: number;
}

const DRAWING_THRESHOLDS: OpeningThresholds = {
  override: OVERRIDE_CONFIDENCE,
  add: STRUCTURE_CONFIDENCE,
  remove: STRUCTURE_CONFIDENCE,
};
import {
  Obj,
  OpeningPrediction,
  OpeningSlot,
  OrderItem,
  PixelBox,
} from '../recognition.types';
import { unionBox } from './glass-sections.utils';
import { isObject } from './guards.utils';

type Zone = Pick<OpeningSlot, 'x0' | 'y0' | 'x1' | 'y1'>;

const objects = (value: unknown): Obj[] =>
  Array.isArray(value) ? (value as unknown[]).filter(isObject) : [];

const stvorkaOf = (value: unknown) => (isObject(value) ? value : undefined);

// Делит зону вертикальными импостами на секции
function splitColumns(zone: Zone, imposts: Obj[]): OpeningSlot[] {
  const sorted = imposts
    .filter((impost) => typeof impost.x === 'number')
    .sort((a, b) => Number(a.x) - Number(b.x));
  const edges = [zone.x0, ...sorted.map((i) => Number(i.x)), zone.x1];

  return edges.slice(0, -1).map((x0, index) => {
    const right = sorted[index];
    const left = sorted[index - 1];
    const stvorka =
      stvorkaOf(right?.leftStvorka) ?? stvorkaOf(left?.rightStvorka);
    const owner = right ?? left;
    const key = right ? 'leftStvorka' : 'rightStvorka';
    return {
      ...zone,
      x0,
      x1: edges[index + 1],
      owner,
      key,
      stvorka,
    };
  });
}

// Раскладывает изделие на секции со створками
export function buildOpeningSlots(item: OrderItem): OpeningSlot[] {
  const width = Number(item.width);
  const height = Number(item.height);
  const whole: Zone = { x0: 0, y0: 0, x1: width, y1: height };
  const rows = objects(item.hImposts)
    .filter((impost) => typeof impost.y === 'number')
    .sort((a, b) => Number(a.y) - Number(b.y));

  if (!rows.length) {
    const columns = objects(item.vImposts);
    if (columns.length) return splitColumns(whole, columns);
    return [{ ...whole, stvorka: stvorkaOf(item.stvorka) }];
  }

  const edges = [0, ...rows.map((row) => Number(row.y)), height];
  return edges.slice(0, -1).flatMap((y0, index) => {
    const zone: Zone = { x0: 0, y0, x1: width, y1: edges[index + 1] };
    const below = rows[index - 1];
    const above = rows[index];
    const columns = [
      ...objects(above?.bottomImposts),
      ...objects(below?.topImposts),
    ];
    if (columns.length) return splitColumns(zone, columns);

    const stvorka =
      stvorkaOf(above?.bottomStvorka) ?? stvorkaOf(below?.topStvorka);
    return [
      {
        ...zone,
        owner: above ?? below,
        key: above ? 'bottomStvorka' : 'topStvorka',
        stvorka,
      },
    ];
  });
}

// Сопоставляет секции со стёклами по положению на чертеже. Если хоть что-то
// не сошлось, возвращает null: чертёж понят неверно и трогать ответ нельзя
export function matchSlotsToGlass(
  item: OrderItem,
  slots: OpeningSlot[],
  boxes: PixelBox[],
): PixelBox[] | null {
  if (!boxes.length) return null;

  const frame = unionBox(boxes);
  const width = Number(item.width);
  const height = Number(item.height);
  const used = new Set<PixelBox>();

  const matched = slots.map((slot) => {
    const inside = boxes.filter((box) => {
      const x = ((box.x + box.width / 2 - frame.x) / frame.width) * width;
      const y =
        (1 - (box.y + box.height / 2 - frame.y) / frame.height) * height;
      return x >= slot.x0 && x < slot.x1 && y >= slot.y0 && y < slot.y1;
    });
    inside.forEach((box) => used.add(box));
    return inside.length ? unionBox(inside) : null;
  });

  if (matched.includes(null) || used.size !== boxes.length) return null;
  return matched as PixelBox[];
}

const SIDES: Partial<Record<string, string>> = {
  left: 'left',
  right: 'right',
  down_left: 'left',
  down_right: 'right',
};

const TYPES: Partial<Record<string, string>> = {
  left: 'pov',
  right: 'pov',
  down_left: 'povOtk',
  down_right: 'povOtk',
};

const isEntranceDoor = (item: OrderItem) =>
  String(item.constructionType ?? '')
    .toLowerCase()
    .includes('входн');

// Правит открывания по ответу модели. Новая или удалённая створка требует
// большей уверенности, чем исправление стороны у существующей
export function applyOpeningPredictions(
  item: OrderItem,
  slots: OpeningSlot[],
  predictions: OpeningPrediction[],
  thresholds: OpeningThresholds = DRAWING_THRESHOLDS,
): void {
  const hasOtherSash = (slot: OpeningSlot) =>
    slots.some((other) => other !== slot && other.stvorka);

  slots.forEach((slot, index) => {
    const { name, confidence } = predictions[index];
    const side = SIDES[name];
    const type = isEntranceDoor(item) ? 'pov' : TYPES[name];

    if (slot.stvorka) {
      if (
        name === 'none' &&
        confidence >= thresholds.remove &&
        slot.owner &&
        slot.key &&
        hasOtherSash(slot)
      ) {
        delete slot.owner[slot.key];
      } else if (side && confidence >= thresholds.override) {
        slot.stvorka.openSide = side;
        slot.stvorka.openType = type;
      }
      return;
    }

    const fillKey = slot.key?.replace('Stvorka', 'Fill');
    if (
      side &&
      confidence >= thresholds.add &&
      slot.owner &&
      slot.key &&
      !(fillKey && fillKey in slot.owner)
    ) {
      slot.owner[slot.key] = { openType: type, openSide: side };
    }
  });
}
