import {
  CLOSER_ON,
  DOOR_FURNITURE,
  DOOR_INWARD,
  DOOR_INWARD_LEGACY,
  DOOR_OUTWARD,
  DOOR_PARAMETERS,
  DOOR_PROFILE,
} from '../constants/entrance-door.constants';
import { Obj, OrderItem } from '../recognition.types';
import { isObject } from './guards.utils';

// Название двери — только строка со словами «входная» или «дверь»
const DOOR_TITLE = /входн|двер/iu;
const BARE_DOOR_TITLE = /^(?:входная\s+)?двер\p{L}*\.?$/iu;

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : typeof value === 'number'
      ? String(value)
      : '';

export const isEntranceDoor = (item: OrderItem): boolean =>
  String(item.constructionType ?? '').startsWith('Дверь входная');

function openingType(item: OrderItem, door: Obj): string {
  const opening = text(door.opening).toLowerCase();
  if (opening.includes('внутр')) return DOOR_INWARD;
  if (opening.includes('наруж')) return DOOR_OUTWARD;
  return item.constructionType === DOOR_INWARD ||
    item.constructionType === DOOR_INWARD_LEGACY
    ? DOOR_INWARD
    : DOOR_OUTWARD;
}

// Модель переписывает с листа строки как есть в doorText, а значения по
// умолчанию, порядок параметров и постоянные поля ставятся здесь по ТЗ
export function finalizeEntranceDoor(item: OrderItem): OrderItem {
  const door: Obj = isObject(item.doorText) ? item.doorText : {};
  delete item.doorText;
  if (!isEntranceDoor(item)) return item;

  item.constructionType = openingType(item, door);
  // ТЗ: название двери — строка у рисунка со словами «входная» или «дверь».
  // Без неё остаётся профиль из шапки бланка, если он есть
  // Одно слово «дверь» без системы профиля хуже, чем профиль из шапки бланка
  const title = DOOR_TITLE.test(text(door.title)) ? text(door.title) : '';
  const bareTitle = BARE_DOOR_TITLE.test(title);
  item.profileName =
    (bareTitle ? text(item.profileName) || title : title) ||
    text(item.profileName) ||
    DOOR_PROFILE;
  item.furnitureName = DOOR_FURNITURE;

  const stvorka: Obj = isObject(item.stvorka) ? item.stvorka : {};
  item.stvorka = stvorka;
  stvorka.openType = 'pov';
  const label = text(door.sideLabel).toLowerCase();
  if (label === 'left' || label === 'right') stvorka.openSide = label;
  if (stvorka.openSide !== 'left' && stvorka.openSide !== 'right') {
    stvorka.openSide = 'left';
  }

  const value = (key: keyof typeof DOOR_PARAMETERS, raw: string) => ({
    name: DOOR_PARAMETERS[key].name,
    value: raw || DOOR_PARAMETERS[key].fallback,
  });
  stvorka.parameters = [
    value('handle', text(door.handle)),
    value('lock', text(door.lock)),
    value('cylinder', text(door.cylinder)),
    value('hinges', text(door.hinges)),
    value('hingeCount', /\d+/.exec(text(door.hingeCount))?.[0] ?? ''),
    value('closer', door.closer === true ? CLOSER_ON : ''),
  ];
  return item;
}
