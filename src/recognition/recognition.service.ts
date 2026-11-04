import { setTimeout as sleep } from 'node:timers/promises';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import sharp from 'sharp';

import { JobQueue } from '../common/job-queue';
import llmConfig from '../config/llm.config';
import {
  CONCURRENT_BLOCKS,
  CONCURRENT_JOBS,
  DOCUMENT_PROMPT,
  DOCUMENT_USER_PROMPT,
  MAX_PHOTO_SIDE,
  PHOTO_PROMPT,
  PHOTO_USER_PROMPT,
  PRIMARY_MODEL_ATTEMPTS,
  RETRY_DELAY_MS,
} from './constants/recognition.constants';
import { DocumentReader } from './document-reader';
import { LlmClient } from './llm.client';
import { RecognitionError } from './recognition.error';
import {
  AdditionalItem,
  Candidate,
  DocumentBlock,
  DocumentType,
  OrderFile,
  OrderItem,
  RecognitionResult,
} from './recognition.types';
import {
  extractAdditionalItemsFromDocx,
  extractAdditionalItemsFromPages,
} from './utils/additional-items.utils';
import { parseMosquitoNets } from './utils/mosquito-net.utils';
import {
  deduplicateAcrossBlocks,
  isNonstandard,
  replaceNonstandard,
} from './utils/order-normalizer.utils';
import {
  buildPhotoAdditionalItems,
  feedbackPrompt,
  postprocessBlockItems,
  postprocessPhotoItems,
} from './utils/order-postprocess.utils';
import {
  sanitizeOrderItems,
  validateOrderItems,
} from './utils/order-validator.utils';

@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name);
  private readonly jobs = new JobQueue(CONCURRENT_JOBS);

  constructor(
    private readonly reader: DocumentReader,
    private readonly llm: LlmClient,
    @Inject(llmConfig.KEY)
    private readonly config: ConfigType<typeof llmConfig>,
  ) {}

  recognize(file: OrderFile): Promise<RecognitionResult> {
    return this.jobs.run(() =>
      file.kind === 'photo'
        ? this.processPhoto(file.content)
        : this.processDocument(file.content, file.extension),
    );
  }

  private async processDocument(
    file: Buffer,
    extension: string,
  ): Promise<RecognitionResult> {
    const pdf = await this.reader.toPdf(file, extension);
    const { blocks, fullText, pageTexts } = await this.reader.read(pdf);
    if (!blocks.length) {
      throw new RecognitionError('документ не похож на заявку');
    }

    const mosquitoNets = parseMosquitoNets(fullText);
    const queue = new JobQueue(CONCURRENT_BLOCKS);
    const extractBlock = async (block: DocumentBlock) => {
      const candidate = await this.askUntilValid(
        this.config.documentModel,
        DOCUMENT_PROMPT,
        DOCUMENT_USER_PROMPT,
        block.image,
        (raw) => postprocessBlockItems(raw, block, mosquitoNets),
      );
      if (candidate) return this.finalizeCandidate(candidate);

      this.logger.warn(`Блок ${block.blockNumber}: данные не извлечены`);
      return [];
    };
    const perBlock = await Promise.all(
      blocks.map((block) => queue.run(() => extractBlock(block))),
    );

    const items =
      blocks[0].documentType === DocumentType.Image
        ? deduplicateAcrossBlocks(perBlock)
        : perBlock.flat();
    if (!items.length) {
      throw new RecognitionError('изделия не найдены');
    }

    return {
      orderItems: replaceNonstandard(items),
      addOrderitems: await this.readAdditionalItems(file, extension, pageTexts),
    };
  }

  private async processPhoto(file: Buffer): Promise<RecognitionResult> {
    // rotate без аргументов применяет EXIF: Android хранит поворот только там
    const image = await sharp(file)
      .rotate()
      .resize(MAX_PHOTO_SIDE, MAX_PHOTO_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const candidate = await this.askUntilValid(
      this.config.photoModel,
      PHOTO_PROMPT,
      PHOTO_USER_PROMPT,
      image,
      postprocessPhotoItems,
    );
    const items = candidate ? this.finalizeCandidate(candidate) : [];
    if (!candidate || !items.length) {
      throw new RecognitionError('изделия не найдены');
    }

    return {
      orderItems: replaceNonstandard(items),
      addOrderitems: buildPhotoAdditionalItems(
        candidate.raw.addOrderitems,
        items,
      ),
    };
  }

  private async readAdditionalItems(
    file: Buffer,
    extension: string,
    pageTexts: string[],
  ): Promise<AdditionalItem[]> {
    if (extension === '.docx') {
      try {
        const items = await extractAdditionalItemsFromDocx(file);
        if (items.length) return items;
      } catch (error) {
        this.logger.warn(`DOCX не разобран: ${String(error)}`);
      }
    }
    return extractAdditionalItemsFromPages(pageTexts);
  }

  // Модель получает найденные ошибки и читает изображение заново. Если основная
  // не справилась за три попытки, одну делает более сильная запасная
  private async askUntilValid(
    model: string,
    systemPrompt: string,
    userPrompt: string,
    image: Buffer,
    postprocess: (raw: OrderItem[]) => OrderItem[],
  ): Promise<Candidate | null> {
    const attempts = [
      ...Array<string>(PRIMARY_MODEL_ATTEMPTS).fill(model),
      this.config.fallbackModel,
    ];
    let best: Candidate | null = null;

    for (const [index, attemptModel] of attempts.entries()) {
      if (index > 0) await sleep(RETRY_DELAY_MS);

      const raw = await this.llm.extract({
        model: attemptModel,
        systemPrompt,
        userPrompt: feedbackPrompt(userPrompt, best?.errors ?? []),
        image,
      });
      if (!raw || !Array.isArray(raw.orderItems)) continue;

      const items = postprocess(raw.orderItems as OrderItem[]);
      const standard = items.filter((item) => !isNonstandard(item));
      const errors = standard.length ? validateOrderItems(standard) : [];
      if (!best || errors.length < best.errors.length) {
        best = { raw, items, errors };
      }
      if (!errors.length) return best;
      this.logger.warn(
        `${attemptModel}: попытка ${index + 1}, нарушений: ${errors.length}`,
      );
    }
    return best;
  }

  private finalizeCandidate(candidate: Candidate): OrderItem[] {
    if (!candidate.errors.length) return candidate.items;

    this.logger.warn(
      `Валидный формат не получен, нарушений: ${candidate.errors.length}`,
    );
    return candidate.items.map((item) =>
      isNonstandard(item) ? item : sanitizeOrderItems([item])[0],
    );
  }
}
