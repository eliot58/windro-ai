/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- данные приходят от модели и из XML, их форма проверяется валидатором */
import {
  CONSTRUCTION_TYPES,
  DIMENSION_FALLBACK,
  FILL_PARAM_FIELDS,
  H_FILLS,
  H_STVORKAS,
  HIMPOST_FIELDS,
  ITEM_FIELDS,
  MIN_IMPOST_DISTANCE,
  OPEN_SIDES,
  OPEN_TYPES,
  REQUIRED_FIELDS,
  STVORKA_FIELDS,
  SUB_IMPOSTS,
  V_FILLS,
  V_STVORKAS,
  VIMPOST_FIELDS,
} from '../constants/order.constants';
import { Axis, Obj, OrderItem } from '../recognition.types';
import { isNumber, isObject } from './guards.utils';

const isPositiveInt = (value: unknown) =>
  Number.isInteger(value) && (value as number) > 0;
const isFilledString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';
const isErrorStub = (item: Obj) =>
  'error' in item && Object.keys(item).length === 1;
const span = (item: Obj, dim: string): number | null =>
  isNumber(item[dim]) && item[dim] > 0 ? item[dim] : null;

function checkGeometry(
  coords: Array<[number, number]>,
  size: number | null,
  axis: Axis,
  prefix: string,
): string[] {
  if (size === null || !coords.length) return [];
  const errors: string[] = [];
  const inside: number[] = [];

  for (const [index, coord] of coords) {
    if (coord <= 0 || coord >= size) {
      errors.push(`${prefix}[${index}]: ${axis}=${coord} вне рамы 0..${size}`);
    } else {
      inside.push(coord);
    }
  }
  if (!inside.length) return errors;

  const bounds = [0, ...inside.sort((a, b) => a - b), size];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const gap = bounds[i + 1] - bounds[i];
    if (gap < MIN_IMPOST_DISTANCE) {
      errors.push(
        `${prefix}: расстояние ${gap} мм между ${axis}=${bounds[i]} и ${axis}=${bounds[i + 1]} меньше ${MIN_IMPOST_DISTANCE} мм`,
      );
    }
  }
  return errors;
}

function validateFillParam(param: unknown, prefix: string): string[] {
  if (!isObject(param)) return [`${prefix}: не объект`];
  const errors: string[] = [];
  for (const key of Object.keys(param)) {
    if (!FILL_PARAM_FIELDS.has(key)) {
      errors.push(`${prefix}: неизвестное поле '${key}'`);
    }
  }
  if (!isFilledString(param.marking)) {
    errors.push(`${prefix}: marking обязателен`);
  }
  for (const key of ['colorIn', 'colorOut']) {
    if (key in param && typeof param[key] !== 'string') {
      errors.push(`${prefix}: ${key} должен быть строкой`);
    }
  }
  return errors;
}

function validateFillFields(
  obj: Obj,
  fillKeys: string[],
  stvorkaKeys: string[],
  prefix: string,
): string[] {
  const errors: string[] = [];
  fillKeys.forEach((fillKey, index) => {
    const paramKey = `${fillKey}Param`;
    const hasFill = fillKey in obj;
    const hasParam = paramKey in obj;
    if (!hasFill && !hasParam) return;

    if (hasFill && !isFilledString(obj[fillKey])) {
      errors.push(`${prefix}: ${fillKey} должно быть непустой строкой`);
    }
    if (hasParam) {
      errors.push(...validateFillParam(obj[paramKey], `${prefix}.${paramKey}`));
      const marking = obj[paramKey]?.marking;
      if (
        hasFill &&
        typeof marking === 'string' &&
        typeof obj[fillKey] === 'string' &&
        marking.trim() !== obj[fillKey].trim()
      ) {
        errors.push(`${prefix}: ${paramKey}.marking не совпадает с ${fillKey}`);
      }
    }
    const stvorkaKey = stvorkaKeys[index];
    if (stvorkaKey && stvorkaKey in obj) {
      errors.push(
        `${prefix}: ${fillKey} вместе с ${stvorkaKey}: у секции либо створка, либо глухое заполнение`,
      );
    }
  });
  return errors;
}

function validateStvorka(
  stvorka: unknown,
  prefix: string,
  width: number | null,
  height: number | null,
): string[] {
  if (!isObject(stvorka)) return [`${prefix}: не объект`];
  const errors: string[] = [];
  for (const key of Object.keys(stvorka)) {
    if (!STVORKA_FIELDS.has(key)) {
      errors.push(`${prefix}: неизвестное поле '${key}'`);
    }
  }
  const { openType, openSide } = stvorka;
  if (openType != null && !OPEN_TYPES.has(openType)) {
    errors.push(`${prefix}: недопустимый openType '${openType}'`);
  }
  if (openSide != null && !OPEN_SIDES.has(openSide)) {
    errors.push(`${prefix}: недопустимый openSide '${openSide}'`);
  }
  if ('isMoskit' in stvorka && typeof stvorka.isMoskit !== 'boolean') {
    errors.push(`${prefix}: isMoskit не bool`);
  }
  errors.push(...validateFillFields(stvorka, ['fill'], [], prefix));
  if ('hImposts' in stvorka) {
    errors.push(
      ...validateHImposts(
        stvorka.hImposts,
        `${prefix}.hImposts`,
        width,
        height,
      ),
    );
  }
  return errors;
}

function validateVImposts(
  imposts: unknown,
  prefix: string,
  width: number | null,
  height: number | null,
): string[] {
  if (!Array.isArray(imposts)) return [`${prefix}: не список`];
  const errors: string[] = [];
  const coords: Array<[number, number]> = [];

  imposts.forEach((impost: unknown, index) => {
    const path = `${prefix}[${index}]`;
    if (!isObject(impost)) {
      errors.push(`${path}: не объект`);
      return;
    }
    for (const key of Object.keys(impost)) {
      if (!VIMPOST_FIELDS.has(key)) {
        errors.push(`${path}: неизвестное поле '${key}'`);
      }
    }
    if (isNumber(impost.x)) coords.push([index, impost.x]);
    else errors.push(`${path}: нет координаты 'x'`);
    for (const key of V_STVORKAS) {
      if (key in impost) {
        errors.push(
          ...validateStvorka(impost[key], `${path}.${key}`, width, height),
        );
      }
    }
    errors.push(...validateFillFields(impost, V_FILLS, V_STVORKAS, path));
  });

  errors.push(...checkGeometry(coords, width, 'x', prefix));
  return errors;
}

function validateHImposts(
  imposts: unknown,
  prefix: string,
  width: number | null,
  height: number | null,
): string[] {
  if (!Array.isArray(imposts)) return [`${prefix}: не список`];
  const errors: string[] = [];
  const coords: Array<[number, number]> = [];

  imposts.forEach((impost: unknown, index) => {
    const path = `${prefix}[${index}]`;
    if (!isObject(impost)) {
      errors.push(`${path}: не объект`);
      return;
    }
    for (const key of Object.keys(impost)) {
      if (!HIMPOST_FIELDS.has(key)) {
        errors.push(`${path}: неизвестное поле '${key}'`);
      }
    }
    if (isNumber(impost.y)) coords.push([index, impost.y]);
    else errors.push(`${path}: нет координаты 'y'`);
    for (const key of H_STVORKAS) {
      if (key in impost) {
        errors.push(
          ...validateStvorka(impost[key], `${path}.${key}`, width, height),
        );
      }
    }
    errors.push(...validateFillFields(impost, H_FILLS, H_STVORKAS, path));
    // x под-импоста отмеряется от левого края изделия, а не внутри полосы
    for (const key of SUB_IMPOSTS) {
      if (key in impost) {
        errors.push(
          ...validateVImposts(impost[key], `${path}.${key}`, width, height),
        );
      }
    }
  });

  errors.push(...checkGeometry(coords, height, 'y', prefix));
  return errors;
}

// Возвращает список нарушений схемы сервера КП, пустой список значит формат верен
export function validateOrderItems(items: unknown): string[] {
  if (!Array.isArray(items)) return ['orderItems не список'];
  if (!items.length) return ['orderItems пуст'];

  const errors: string[] = [];
  items.forEach((item: unknown, index) => {
    const prefix = `item[${index}]`;
    if (!isObject(item)) {
      errors.push(`${prefix}: не объект`);
      return;
    }
    if (isErrorStub(item)) return;

    for (const key of Object.keys(item)) {
      if (!ITEM_FIELDS.has(key)) {
        errors.push(`${prefix}: неизвестное поле '${key}'`);
      }
    }
    for (const field of REQUIRED_FIELDS) {
      if (item[field] == null || item[field] === '') {
        errors.push(`${prefix}: нет обязательного поля '${field}'`);
      }
    }
    const type = item.constructionType;
    if (type != null && !CONSTRUCTION_TYPES.has(type)) {
      errors.push(`${prefix}: недопустимый constructionType '${type}'`);
    }
    for (const dim of ['width', 'height']) {
      const value = item[dim];
      if (value != null && (!isNumber(value) || value <= 0)) {
        errors.push(`${prefix}: ${dim}=${value} не положительное число`);
      }
    }
    if (item.qu != null && !isPositiveInt(item.qu)) {
      errors.push(`${prefix}: qu=${item.qu} не положительное целое`);
    }
    if ('stvorka' in item && ('vImposts' in item || 'hImposts' in item)) {
      errors.push(`${prefix}: stvorka не сочетается с vImposts/hImposts`);
    }

    const width = span(item, 'width');
    const height = span(item, 'height');
    if ('stvorka' in item) {
      errors.push(
        ...validateStvorka(item.stvorka, `${prefix}.stvorka`, width, height),
      );
    }
    if ('vImposts' in item) {
      errors.push(
        ...validateVImposts(item.vImposts, `${prefix}.vImposts`, width, height),
      );
    }
    if ('hImposts' in item) {
      errors.push(
        ...validateHImposts(item.hImposts, `${prefix}.hImposts`, width, height),
      );
    }
    errors.push(...validateFillFields(item, ['fill'], [], prefix));
  });
  return errors;
}

function stripUnknown(obj: Obj, allowed: Set<string>) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) delete obj[key];
  }
}

function dropBadGeometry(kept: Obj[], size: number | null, axis: Axis): Obj[] {
  if (size === null || !kept.length) return kept;

  let survivors = kept.filter((o) => o[axis] > 0 && o[axis] < size);

  // Промежутки считаем по координате, а порядок списка сохраняем: на нём держатся створки
  const dropped = new Set<Obj>();
  let previous = 0;
  for (const impost of [...survivors].sort((a, b) => a[axis] - b[axis])) {
    if (impost[axis] - previous < MIN_IMPOST_DISTANCE) dropped.add(impost);
    else previous = impost[axis];
  }
  survivors = survivors.filter((o) => !dropped.has(o));

  while (survivors.length) {
    const last = survivors.reduce((a, b) => (b[axis] > a[axis] ? b : a));
    if (size - last[axis] >= MIN_IMPOST_DISTANCE) break;
    survivors = survivors.filter((o) => o !== last);
  }
  return survivors;
}

function sanitizeFillParam(param: unknown): Obj | null {
  if (!isObject(param) || !isFilledString(param.marking)) return null;
  stripUnknown(param, FILL_PARAM_FIELDS);
  param.marking = param.marking.trim();
  for (const key of ['colorIn', 'colorOut']) {
    if (key in param && typeof param[key] !== 'string') delete param[key];
  }
  return param;
}

function sanitizeFillFields(
  obj: Obj,
  fillKeys: string[],
  stvorkaKeys: string[],
) {
  fillKeys.forEach((fillKey, index) => {
    const paramKey = `${fillKey}Param`;
    if (!(fillKey in obj) && !(paramKey in obj)) return;

    if (paramKey in obj) {
      const fixed = sanitizeFillParam(obj[paramKey]);
      if (fixed) obj[paramKey] = fixed;
      else delete obj[paramKey];
    }

    let value: string | null = null;
    if (fillKey in obj) {
      if (isFilledString(obj[fillKey])) {
        value = obj[fillKey].trim();
        obj[fillKey] = value;
      } else {
        delete obj[fillKey];
      }
    }

    // Строка ведущая: она прошла нормализацию, а карточка выводится из неё
    if (value && obj[paramKey]) obj[paramKey].marking = value;
    if (value === null && obj[paramKey]) obj[fillKey] = obj[paramKey].marking;

    const stvorka = obj[stvorkaKeys[index]];
    if (stvorka == null) return;
    // Заполнение на стороне со створкой относится к самой створке
    if (isObject(stvorka) && !stvorka.fill) {
      if (obj[fillKey]) stvorka.fill = obj[fillKey];
      if (obj[paramKey]) stvorka.fillParam = obj[paramKey];
    }
    delete obj[fillKey];
    delete obj[paramKey];
  });
}

function sanitizeStvorka(
  stvorka: unknown,
  width: number | null,
  height: number | null,
) {
  if (!isObject(stvorka)) return;
  stripUnknown(stvorka, STVORKA_FIELDS);
  sanitizeFillFields(stvorka, ['fill'], []);
  if (stvorka.openType != null && !OPEN_TYPES.has(stvorka.openType)) {
    stvorka.openType = 'pov';
  }
  if (stvorka.openSide != null && !OPEN_SIDES.has(stvorka.openSide)) {
    stvorka.openSide = 'left';
  }
  if ('isMoskit' in stvorka && typeof stvorka.isMoskit !== 'boolean') {
    delete stvorka.isMoskit;
  }
  if ('hImposts' in stvorka) {
    stvorka.hImposts = sanitizeHImposts(stvorka.hImposts, width, height);
  }
}

function sanitizeStvorkaKeys(
  impost: Obj,
  keys: string[],
  width: number | null,
  height: number | null,
) {
  for (const key of keys) {
    if (!(key in impost)) continue;
    if (isObject(impost[key])) sanitizeStvorka(impost[key], width, height);
    else delete impost[key];
  }
}

function sanitizeVImposts(
  imposts: unknown,
  width: number | null,
  height: number | null,
): Obj[] {
  if (!Array.isArray(imposts)) return [];
  const kept: Obj[] = [];
  for (const impost of imposts as unknown[]) {
    if (!isObject(impost)) continue;
    stripUnknown(impost, VIMPOST_FIELDS);
    if (!isNumber(impost.x)) continue;
    sanitizeStvorkaKeys(impost, V_STVORKAS, width, height);
    sanitizeFillFields(impost, V_FILLS, V_STVORKAS);
    kept.push(impost);
  }
  return dropBadGeometry(kept, width, 'x');
}

function sanitizeHImposts(
  imposts: unknown,
  width: number | null,
  height: number | null,
): Obj[] {
  if (!Array.isArray(imposts)) return [];
  const kept: Obj[] = [];
  for (const impost of imposts as unknown[]) {
    if (!isObject(impost)) continue;
    stripUnknown(impost, HIMPOST_FIELDS);
    if (!isNumber(impost.y)) continue;
    sanitizeStvorkaKeys(impost, H_STVORKAS, width, height);
    sanitizeFillFields(impost, H_FILLS, H_STVORKAS);
    for (const key of SUB_IMPOSTS) {
      if (key in impost) {
        impost[key] = sanitizeVImposts(impost[key], width, height);
      }
    }
    kept.push(impost);
  }
  return dropBadGeometry(kept, height, 'y');
}

function sanitizeItem(item: Obj): Obj {
  stripUnknown(item, ITEM_FIELDS);

  if (!CONSTRUCTION_TYPES.has(item.constructionType)) {
    item.constructionType = 'Окно';
  }
  for (const dim of ['width', 'height']) {
    if (!isNumber(item[dim]) || item[dim] <= 0) item[dim] = DIMENSION_FALLBACK;
  }
  if (!isPositiveInt(item.qu)) item.qu = 1;
  if ('stvorka' in item && ('vImposts' in item || 'hImposts' in item)) {
    delete item.stvorka;
  }

  const width = span(item, 'width');
  const height = span(item, 'height');
  sanitizeStvorkaKeys(item, ['stvorka'], width, height);
  if ('vImposts' in item) {
    item.vImposts = sanitizeVImposts(item.vImposts, width, height);
  }
  if ('hImposts' in item) {
    item.hImposts = sanitizeHImposts(item.hImposts, width, height);
  }
  sanitizeFillFields(item, ['fill'], []);
  return item;
}

// Последняя линия обороны: чинит изделия так, чтобы они прошли validateOrderItems
export function sanitizeOrderItems(items: OrderItem[]): OrderItem[] {
  return (structuredClone(items) as unknown[])
    .filter(isObject)
    .map((item) => (isErrorStub(item) ? item : sanitizeItem(item)));
}
