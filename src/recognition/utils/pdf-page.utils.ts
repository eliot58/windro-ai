import sharp from 'sharp';

import {
  END_PATTERNS,
  FOOTER_LINES,
  MIN_CONTENT_RATIO,
  RENDER_DPI,
  WINDOW_WORDS,
} from '../constants/document.constants';
import { DocumentType, Mupdf, PdfPage, Rect, Word } from '../recognition.types';
// mupdf публикуется только как ESM с top-level await, require его не загрузит.
// Обычный import() компилятор commonjs превратил бы в require
// eslint-disable-next-line @typescript-eslint/no-implied-eval
export const loadMupdf = new Function(
  'return import("mupdf")',
) as () => Promise<Mupdf>;

export function detectDocumentType(
  text: string,
  hasImages: boolean,
): DocumentType {
  if (text.trim().length < 50 && hasImages) return DocumentType.Image;
  if (/Поз\s*№/u.test(text)) return DocumentType.Proposal;
  if (/Изделие\s*№\s*\d+/u.test(text)) return DocumentType.Calculation;
  if (/\d+\s*\n\s*Изделие\s*№\s*\n/u.test(text)) {
    return DocumentType.TechnicalSpec;
  }
  if (
    /№\d+/u.test(text) &&
    /Позиция|Наименование|Балконная дверь|Окно/u.test(text)
  ) {
    return DocumentType.ShortProposal;
  }
  // Нестандартный формат с оконными терминами уходит в LLM постранично
  return WINDOW_WORDS.test(text) ? DocumentType.Image : DocumentType.Unknown;
}

export class Page {
  readonly text: string;
  readonly bounds: Rect;
  readonly hasImages: boolean;
  private readonly words: Word[] = [];
  private png?: Promise<Buffer>;

  constructor(
    private readonly mupdf: Mupdf,
    private readonly page: PdfPage,
  ) {
    const [x0, y0, x1, y1] = page.getBounds();
    this.bounds = { x0, y0, x1, y1 };

    const structured = page.toStructuredText('preserve-images');
    let text = '';
    let hasImages = false;
    let word: Word | null = null;
    const endWord = () => {
      if (word) this.words.push(word);
      word = null;
    };

    structured.walk({
      onImageBlock: () => {
        hasImages = true;
      },
      onChar: (char, _origin, _font, _size, quad) => {
        text += char;
        if (/\s/u.test(char)) {
          endWord();
          return;
        }
        word ??= { x0: quad[0], y0: quad[1], text: '' };
        word.text += char;
      },
      endLine: () => {
        text += '\n';
        endWord();
      },
    });
    this.text = text;
    this.hasImages = hasImages;
  }

  search(needle: string): Rect[] {
    return this.page.search(needle, undefined).map((quads) => {
      const xs = quads.flatMap((q) => [q[0], q[2], q[4], q[6]]);
      const ys = quads.flatMap((q) => [q[1], q[3], q[5], q[7]]);
      return {
        x0: Math.min(...xs),
        y0: Math.min(...ys),
        x1: Math.max(...xs),
        y1: Math.max(...ys),
      };
    });
  }

  rowText(rect: Rect, tolerance = 6): string {
    return this.words
      .filter((word) => Math.abs(word.y0 - rect.y0) <= tolerance)
      .sort((a, b) => a.x0 - b.x0)
      .map((word) => word.text)
      .join(' ');
  }

  async render(rect: Rect = this.bounds): Promise<Buffer> {
    const zoom = RENDER_DPI / 72;
    this.png ??= Promise.resolve(
      Buffer.from(
        this.page
          .toPixmap(
            this.mupdf.Matrix.scale(zoom, zoom),
            this.mupdf.ColorSpace.DeviceRGB,
            false,
            true,
          )
          .asPNG(),
      ),
    );
    const png = await this.png;
    const { width = 0, height = 0 } = await sharp(png).metadata();

    const left = Math.max(0, Math.floor((rect.x0 - this.bounds.x0) * zoom));
    const top = Math.max(0, Math.floor((rect.y0 - this.bounds.y0) * zoom));
    const right = Math.min(width, Math.ceil((rect.x1 - this.bounds.x0) * zoom));
    const bottom = Math.min(
      height,
      Math.ceil((rect.y1 - this.bounds.y0) * zoom),
    );
    return sharp(png)
      .extract({ left, top, width: right - left, height: bottom - top })
      .png()
      .toBuffer();
  }
}

export async function hasContent(image: Buffer): Promise<boolean> {
  const { data } = await sharp(image)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (const value of data) if (value < 240) dark++;
  return dark / data.length >= MIN_CONTENT_RATIO;
}

export function findBlockTop(
  page: Page,
  searchText: string,
  type: DocumentType,
  blockNumber: number,
): Rect | null {
  let hits = page.search(searchText);
  if (!hits.length && type === DocumentType.TechnicalSpec) {
    hits = page.search(`${blockNumber}`);
  }
  if (!hits.length) return null;

  const topmost = (rects: Rect[]) =>
    rects.reduce((a, b) => (b.y0 < a.y0 ? b : a));

  // Маркер встречается и в шапке страницы, её верхние 50 пунктов пропускаем
  const belowHeader = hits.filter((rect) => rect.y0 > 50);
  let start = topmost(belowHeader.length ? belowHeader : hits);

  if (type === DocumentType.TechnicalSpec) {
    const own = hits.filter((rect) =>
      new RegExp(`Изделие\\s*№\\s*${blockNumber}(?![\\p{L}\\p{N}_])`, 'u').test(
        page.rowText(rect),
      ),
    );
    const headers = own.filter(
      (rect) => !page.rowText(rect).includes('Количество'),
    );
    if (own.length) start = topmost(headers.length ? headers : own);
  }
  return start;
}

export function findBlockBottom(
  page: Page,
  startY: number,
  type: DocumentType,
  blockNumber: number,
): number {
  let bottom = page.bounds.y1;

  // В техзадании подвал «Изделие № N Количество: Q» принадлежит текущему блоку
  let ownFooterY: number | null = null;
  if (type === DocumentType.TechnicalSpec) {
    const below = page
      .search('Вид изделия со стороны')
      .map((rect) => rect.y0)
      .filter((y) => y > startY + 50);
    if (below.length) ownFooterY = Math.min(...below);
  }

  for (const pattern of END_PATTERNS[type] ?? []) {
    const rects: Rect[] = [];
    for (const match of page.text.matchAll(pattern)) {
      const number = /\d+/u.exec(match[0]);
      if (blockNumber > 0 && number && Number(number[0]) === blockNumber) {
        continue;
      }
      rects.push(...page.search(match[0].slice(0, 20)));
    }
    for (const rect of rects) {
      if (
        ownFooterY !== null &&
        pattern.source.includes('Изделие') &&
        rect.y0 < ownFooterY
      ) {
        continue;
      }
      if (rect.y0 > startY + 50 && rect.y0 < bottom) bottom = rect.y0 - 5;
    }
  }

  const footer = FOOTER_LINES[type];
  for (const text of footer?.texts ?? []) {
    for (const rect of page.search(text)) {
      if (rect.y0 <= startY + 50) continue;
      bottom = Math.min(bottom, rect.y1 + footer!.margin);
    }
  }
  return bottom;
}
