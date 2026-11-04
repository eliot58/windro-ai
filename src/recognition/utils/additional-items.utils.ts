import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';

import {
  COLOR,
  COLUMN_HEADERS,
  COST,
  DOCX_SECTION,
  PAGE_FOOTER,
  PDF_SECTION,
  QUANTITY,
  SIZE_PAIR,
  SIZE_SINGLE,
} from '../constants/additional-items.constants';
import { AdditionalItem, XmlNode } from '../recognition.types';

const toInt = (value: string) => Number(value.replace(/\s/g, ''));

function tableText(pageText: string): string | null {
  const start = pageText.indexOf(PDF_SECTION);
  if (start < 0) return null;
  const afterHeader = pageText.slice(start + PDF_SECTION.length);

  const cost = afterHeader.indexOf('Стоимость');
  if (cost < 0) return null;
  const newline = afterHeader.indexOf('\n', cost);
  if (newline < 0) return null;

  let table = afterHeader.slice(newline + 1);
  for (const marker of ['ИТОГО:', 'Работы', 'Условия']) {
    const index = table.indexOf(marker);
    if (index >= 0) table = table.slice(0, index);
  }
  return table.trim();
}

function buildItem(
  nameLines: string[],
  color: string,
  numberLines: string[],
): AdditionalItem | null {
  const name = nameLines.join(' ').trim();
  if (!name) return null;

  let quantity: string | null = null;
  let size: string | null = null;
  for (const raw of numberLines) {
    const line = raw.trim();
    if (COST.test(line)) continue;
    if (SIZE_PAIR.test(line)) size = line;
    else if (QUANTITY.test(line) && quantity === null) quantity = line;
    else if (SIZE_SINGLE.test(line) && quantity !== null && size === null) {
      size = line;
    }
  }
  if (quantity === null) return null;

  const item: AdditionalItem = { name, color, qu: Number(quantity) };
  const pair = size ? SIZE_PAIR.exec(size) : null;
  if (pair) {
    item.thick = toInt(pair[1]);
    item.width = toInt(pair[2]);
  } else if (size) {
    item.thick = toInt(size);
  }
  return item;
}

// Строка таблицы в тексте PDF: название с цветом X/X/X, затем количество, размер, цена
function parseTable(text: string): AdditionalItem[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !PAGE_FOOTER.test(line) &&
        !COLUMN_HEADERS.has(line) &&
        line !== PDF_SECTION &&
        !(line.startsWith('Изд') && line.length < 10),
    );

  const items: AdditionalItem[] = [];
  let nameLines: string[] = [];
  let numberLines: string[] = [];
  let color = '';
  let collecting = false;

  const flush = () => {
    const item = buildItem(nameLines, color, numberLines);
    if (item) items.push(item);
  };
  const reset = () => {
    nameLines = [];
    numberLines = [];
    color = '';
    collecting = false;
  };

  for (const line of lines) {
    if (collecting) {
      const numeric =
        QUANTITY.test(line) ||
        COST.test(line) ||
        SIZE_PAIR.test(line) ||
        SIZE_SINGLE.test(line);
      if (numeric) {
        numberLines.push(line);
        if (COST.test(line)) {
          flush();
          reset();
        }
        continue;
      }
      if (numberLines.length) flush();
      reset();
    }

    const match = COLOR.exec(line);
    if (match) {
      const namePart = line.slice(0, match.index).trim();
      if (namePart) nameLines.push(namePart);
      color = match[1].trim();
      collecting = true;
      numberLines = [];
    } else {
      nameLines.push(line);
    }
  }
  if (collecting && numberLines.length) flush();
  return items;
}

export function extractAdditionalItemsFromPages(
  pageTexts: string[],
): AdditionalItem[] {
  const tables = pageTexts
    .filter((text) => text.includes(PDF_SECTION))
    .map(tableText)
    .filter((table): table is string => !!table);
  return tables.length ? parseTable(tables.join('\n')) : [];
}

const childrenOf = (node: XmlNode, tag: string): XmlNode[] =>
  (node[tag] as XmlNode[] | undefined) ?? [];

const findChild = (nodes: XmlNode[], tag: string) =>
  nodes.find((node) => tag in node);

const attr = (node: XmlNode | undefined, name: string): string | undefined =>
  (node?.[':@'] as Record<string, string> | undefined)?.[`@_${name}`];

function collectText(nodes: XmlNode[]): string {
  let text = '';
  for (const node of nodes) {
    if ('#text' in node) text += String(node['#text']);
    else if ('w:tab' in node) text += '\t';
    else if ('w:br' in node) text += '\n';
    else {
      const tag = Object.keys(node).find((key) => key !== ':@');
      if (tag && Array.isArray(node[tag])) {
        text += collectText(node[tag] as XmlNode[]);
      }
    }
  }
  return text;
}

function cellText(cell: XmlNode): string {
  return childrenOf(cell, 'w:tc')
    .filter((node) => 'w:p' in node)
    .map((paragraph) => collectText(childrenOf(paragraph, 'w:p')))
    .join('\n');
}

// Разворачивает строки таблицы по сетке: объединённая ячейка занимает все свои колонки
function tableRows(table: XmlNode): string[][] {
  const rows: string[][] = [];
  for (const row of childrenOf(table, 'w:tbl').filter((n) => 'w:tr' in n)) {
    const nodes = childrenOf(row, 'w:tr');
    const properties = findChild(nodes, 'w:trPr');
    const gridBefore = properties
      ? findChild(childrenOf(properties, 'w:trPr'), 'w:gridBefore')
      : undefined;
    const cells: string[] = Array<string>(
      Number(attr(gridBefore, 'w:val') ?? 0),
    ).fill('');

    for (const cell of nodes.filter((node) => 'w:tc' in node)) {
      const cellProperties = findChild(childrenOf(cell, 'w:tc'), 'w:tcPr');
      const propertyNodes = cellProperties
        ? childrenOf(cellProperties, 'w:tcPr')
        : [];
      const gridSpan = Number(
        attr(findChild(propertyNodes, 'w:gridSpan'), 'w:val') ?? 1,
      );
      const verticalMerge = findChild(propertyNodes, 'w:vMerge');
      const continues =
        verticalMerge && attr(verticalMerge, 'w:val') !== 'restart';
      const text = continues
        ? (rows[rows.length - 1]?.[cells.length] ?? '')
        : cellText(cell);
      for (let i = 0; i < gridSpan; i++) cells.push(text);
    }
    rows.push(cells);
  }
  return rows;
}

function parseDocxQuantity(raw: string): number | null {
  const match = /^(\d+)(?:[,.]\d+)?$/u.exec(raw.trim().replace(/ /g, ''));
  return match ? Number(match[1]) : null;
}

function parseDocxSize(raw: string): [number | null, number | null] {
  const text = raw
    .trim()
    .replace(/мм\s*$/u, '')
    .trim();
  const pair = SIZE_PAIR.exec(text);
  if (pair) return [toInt(pair[1]), toInt(pair[2])];
  const single = SIZE_SINGLE.exec(text);
  return single ? [toInt(single[1]), null] : [null, null];
}

function parseDocxName(text: string): [string, string] {
  const match = /\(([^)]+)\)\s*$/u.exec(text);
  return match
    ? [text.slice(0, match.index).trim(), match[1].trim()]
    : [text.trim(), ''];
}

export async function extractAdditionalItemsFromDocx(
  file: Buffer,
): Promise<AdditionalItem[]> {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return [];

  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    trimValues: false,
    parseTagValue: false,
  }).parse(xml) as XmlNode[];
  const document = findChild(parsed, 'w:document');
  const body = document
    ? findChild(childrenOf(document, 'w:document'), 'w:body')
    : undefined;
  if (!body) return [];

  const items: AdditionalItem[] = [];
  for (const table of childrenOf(body, 'w:body').filter(
    (node) => 'w:tbl' in node,
  )) {
    let inSection = false;
    let skipHeader = false;

    for (const row of tableRows(table)) {
      if (row.length < 20) continue;
      const first = row[0].trim();
      const second = row[1].trim();

      if (first.includes(DOCX_SECTION)) {
        inSection = true;
        skipHeader = true;
        continue;
      }
      if (!inSection) continue;

      if (skipHeader) {
        skipHeader = false;
        if (
          first === '№' ||
          (first === '' && ['Артикул', ''].includes(second))
        ) {
          continue;
        }
      }
      if (
        ['Стр:', 'Счет №', 'Бланк', 'ИТОГО'].some((m) => first.includes(m)) ||
        ['Стр:', 'Счет №', 'Бланк'].some((m) => second.includes(m))
      ) {
        inSection = false;
        continue;
      }
      if (!/^\d+(\.\d+)?$/u.test(first)) continue;

      const [name, color] = parseDocxName(row[3].trim() || second);
      const quantity = parseDocxQuantity(row[19]);
      if (!name || quantity === null) continue;

      const [thick, width] = parseDocxSize(row[9]);
      const item: AdditionalItem = { name, color, qu: quantity };
      if (thick !== null) item.thick = thick;
      if (width !== null) item.width = width;
      items.push(item);
    }
  }
  return items;
}
