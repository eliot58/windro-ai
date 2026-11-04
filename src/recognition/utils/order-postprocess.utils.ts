import { MAX_FEEDBACK_ERRORS } from '../constants/recognition.constants';
import {
  AdditionalItem,
  DocumentBlock,
  DocumentType,
  MosquitoNetMap,
  OrderItem,
} from '../recognition.types';
import { applyMosquitoNet } from './mosquito-net.utils';
import {
  applyFillParams,
  coerceNumbers,
  decomposeComposite,
  detectComposite,
  fixOpenSides,
  fixSwappedDimensions,
  isDoor,
  normalizeFillsInStructure,
  normalizeFurnitureName,
  normalizeImpostStructure,
  normalizeProfileName,
  normalizeSectionFill,
  normalizeStvorkaPositions,
  roundCoordinates,
  stripSmallDoorTransoms,
  validateColors,
} from './order-normalizer.utils';
function normalizeCommon(
  item: OrderItem,
  handwritten: boolean,
  pageText: string,
): OrderItem {
  const door = isDoor(item);
  if ('profileName' in item) {
    item.profileName = normalizeProfileName(
      item.profileName,
      door,
      handwritten,
    );
  }
  if ('furnitureName' in item) {
    item.furnitureName = normalizeFurnitureName(
      item.furnitureName,
      door,
      pageText,
    );
  }
  if ('fill' in item) item.fill = normalizeSectionFill(item.fill, false);
  normalizeFillsInStructure(item);
  return fixSwappedDimensions(validateColors(item));
}

export function postprocessBlockItems(
  rawItems: OrderItem[],
  block: Pick<DocumentBlock, 'blockNumber' | 'documentType' | 'pageText'>,
  mosquitoNets: MosquitoNetMap,
): OrderItem[] {
  const composite = detectComposite(block.pageText, block.blockNumber);
  const isComposite = composite.count > 1;
  let items = structuredClone(rawItems).map(coerceNumbers);

  // Если ширина близка к общей, модель вернула всю конструкцию целиком
  const { totalWidth } = composite;
  if (
    isComposite &&
    totalWidth &&
    items.some((item) => Number(item.width) > totalWidth * 0.7)
  ) {
    items = items.map((item) => decomposeComposite(item, composite.count));
  }

  // В сканах номер блока это страница, поэтому там сетки ставит сама модель.
  // У составных конструкций привязка сетки к изделию неясна
  const nets =
    block.documentType !== DocumentType.Image && !isComposite
      ? mosquitoNets.get(block.blockNumber)
      : undefined;

  return items.map((item) => {
    stripSmallDoorTransoms(item);
    fixOpenSides(item);
    normalizeImpostStructure(item);
    normalizeStvorkaPositions(item);
    normalizeCommon(item, false, block.pageText);
    if (nets) applyMosquitoNet(item, nets);
    roundCoordinates(item);
    return applyFillParams(item);
  });
}

export function postprocessPhotoItems(rawItems: OrderItem[]): OrderItem[] {
  return structuredClone(rawItems)
    .map(coerceNumbers)
    .map((item) => {
      fixOpenSides(item);
      normalizeImpostStructure(item);
      normalizeStvorkaPositions(item);
      normalizeCommon(item, true, '');

      // Похоже на сантиметры
      for (const key of ['width', 'height']) {
        const value: unknown = item[key];
        if (typeof value === 'number' && value >= 30 && value <= 300) {
          item[key] = Math.trunc(value * 10);
        }
      }
      roundCoordinates(item);

      if (!String(item.colorIn ?? '').trim()) item.colorIn = 'W';
      if (!String(item.colorOut ?? '').trim()) item.colorOut = 'W';
      return applyFillParams(item);
    });
}

// На одном бланке цвета общие, поэтому допы наследуют их от первого изделия
export function buildPhotoAdditionalItems(
  raw: unknown,
  items: OrderItem[],
): AdditionalItem[] {
  if (!Array.isArray(raw)) return [];
  const colorIn = String(items[0]?.colorIn ?? 'W');
  const colorOut = String(items[0]?.colorOut ?? 'W');
  const positive = (value: unknown) =>
    typeof value === 'number' && value > 0 ? Math.trunc(value) : undefined;

  const result: AdditionalItem[] = [];
  for (const entry of raw as Array<Record<string, unknown> | null>) {
    if (typeof entry !== 'object' || entry === null) continue;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const { qu } = entry;
    if (!name || !Number.isInteger(qu) || (qu as number) <= 0) continue;

    let thick = positive(entry.thick);
    let width = positive(entry.width);
    // Сервер КП ждёт длину вдоль окна в thick, а глубину в width
    if (thick !== undefined && width !== undefined && thick < width) {
      [thick, width] = [width, thick];
    }
    result.push({
      name,
      colorIn,
      colorOut,
      qu: qu as number,
      ...(thick !== undefined && { thick }),
      ...(width !== undefined && { width }),
    });
  }
  return result;
}

export const feedbackPrompt = (basePrompt: string, errors: string[]) =>
  errors.length
    ? `${basePrompt}\n\nПредыдущий ответ не прошёл проверку. Внимательно перечитай изображение и исправь: ${errors.slice(0, MAX_FEEDBACK_ERRORS).join('; ')}`
    : basePrompt;
