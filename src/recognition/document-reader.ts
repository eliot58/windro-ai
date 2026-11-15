import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Injectable, Logger } from '@nestjs/common';

import {
  CONVERT_TIMEOUT_MS,
  START_PATTERNS,
  TECHNICAL_SPEC_FALLBACK,
} from './constants/document.constants';
import { DocumentBlock, DocumentType, ReadDocument } from './recognition.types';
import {
  detectDocumentType,
  findBlockBottom,
  findBlockTop,
  hasContent,
  loadMupdf,
  Page,
} from './utils/pdf-page.utils';

@Injectable()
export class DocumentReader {
  private readonly logger = new Logger(DocumentReader.name);

  // DOC и DOCX читаются как PDF после конвертации через LibreOffice
  async toPdf(file: Buffer, extension: string): Promise<Buffer> {
    if (extension === '.pdf') return file;

    const dir = await mkdtemp(join(tmpdir(), 'windro-'));
    try {
      const source = join(dir, `source${extension}`);
      await writeFile(source, file);
      await promisify(execFile)(
        'soffice',
        [
          // Свой профиль на каждый запуск, иначе параллельные конвертации мешают друг другу
          `-env:UserInstallation=file://${join(dir, 'profile')}`,
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          source,
        ],
        { timeout: CONVERT_TIMEOUT_MS },
      );
      return await readFile(join(dir, 'source.pdf'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async read(pdf: Buffer): Promise<ReadDocument> {
    const mupdf = await loadMupdf();
    const document = mupdf.Document.openDocument(pdf, 'application/pdf');
    const pages: Page[] = [];
    for (let i = 0; i < document.countPages(); i++) {
      pages.push(new Page(mupdf, document.loadPage(i)));
    }

    const pageTexts = pages.map((page) => page.text);
    const fullText = pageTexts.join('\n');
    const type = detectDocumentType(
      fullText,
      pages.some((page) => page.hasImages),
    );
    this.logger.log(`Тип документа: ${type}, страниц: ${pages.length}`);

    if (type === DocumentType.Unknown) {
      return { blocks: [], fullText, pageTexts };
    }
    const blocks =
      type === DocumentType.Image
        ? await this.readPages(pages)
        : await this.readBlocks(pages, type);
    return { blocks, fullText, pageTexts };
  }

  private async readPages(pages: Page[]): Promise<DocumentBlock[]> {
    const blocks: DocumentBlock[] = [];
    for (const [index, page] of pages.entries()) {
      blocks.push({
        image: await page.render(),
        blockNumber: index + 1,
        documentType: DocumentType.Image,
        pageText: page.text,
      });
    }
    return blocks;
  }

  private async readBlocks(
    pages: Page[],
    type: DocumentType,
  ): Promise<DocumentBlock[]> {
    let pattern = START_PATTERNS[type]!;
    if (
      type === DocumentType.TechnicalSpec &&
      !pages.some((page) => page.text.search(pattern) >= 0)
    ) {
      pattern = TECHNICAL_SPEC_FALLBACK;
    }

    const blocks: DocumentBlock[] = [];
    const seen = new Set<number>();

    for (const [pageIndex, page] of pages.entries()) {
      for (const match of page.text.matchAll(pattern)) {
        const blockNumber = Number(match[1]);
        if (seen.has(blockNumber)) continue;
        seen.add(blockNumber);

        const searchText =
          type === DocumentType.TechnicalSpec ? 'Изделие №' : match[0];
        const start = findBlockTop(page, searchText, type, blockNumber);
        if (!start) {
          this.logger.warn(`Не найдены границы блока №${blockNumber}`);
          continue;
        }

        let image = await page.render({
          x0: page.bounds.x0,
          y0: Math.max(0, start.y0 - 10),
          x1: page.bounds.x1,
          y1: findBlockBottom(page, start.y0, type, blockNumber),
        });
        let pageText = page.text;

        if (!(await hasContent(image))) {
          // Маркер внизу страницы, а чертёж на следующей. Иначе позиция удалена
          const next = pages[pageIndex + 1];
          if (!next || next.text.search(pattern) >= 0) continue;
          image = await next.render();
          if (!(await hasContent(image))) continue;
          pageText = next.text;
        }

        blocks.push({ image, blockNumber, documentType: type, pageText });
      }
    }
    return blocks;
  }
}
