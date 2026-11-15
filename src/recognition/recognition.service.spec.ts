/* eslint-disable @typescript-eslint/no-unsafe-member-access -- данные приходят от модели и из XML, их форма проверяется валидатором */
import { DocumentReader } from './document-reader';
import { HandwrittenOpeningsService } from './handwritten-openings.service';
import { LlmClient } from './llm.client';
import { OpeningClassifierService } from './opening-classifier.service';
import { RecognitionError } from './recognition.error';
import { RecognitionService } from './recognition.service';
import { DocumentType } from './recognition.types';
import { parseJsonResponse } from './utils/llm-response.utils';
import {
  buildPhotoAdditionalItems,
  postprocessBlockItems,
} from './utils/order-postprocess.utils';

const CONFIG = {
  documentModel: 'doc-model',
  photoModel: 'photo-model',
  fallbackModel: 'fallback-model',
};
const BLOCK = {
  image: Buffer.from('png'),
  blockNumber: 1,
  documentType: DocumentType.Calculation,
  pageText: '',
};
const DOCUMENT = {
  kind: 'document' as const,
  extension: '.pdf',
  content: Buffer.from('x'),
};
const VALID_ITEM = {
  constructionType: 'Окно',
  width: 1200,
  height: 1400,
  qu: 1,
  stvorka: { openType: 'pov', openSide: 'left' },
};

jest.mock('node:timers/promises', () => ({
  setTimeout: () => Promise.resolve(),
}));

describe('RecognitionService', () => {
  const extract = jest.fn();
  const reader = {
    toPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    read: jest.fn(),
  };
  const service = new RecognitionService(
    reader as unknown as DocumentReader,
    { extract } as unknown as LlmClient,
    { correct: jest.fn() } as unknown as OpeningClassifierService,
    { correct: jest.fn() } as unknown as HandwrittenOpeningsService,
    CONFIG as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    reader.read.mockResolvedValue({
      blocks: [BLOCK],
      fullText: '',
      pageTexts: [],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns items on the first attempt', async () => {
    extract.mockResolvedValue({ orderItems: [VALID_ITEM] });

    const result = await service.recognize(DOCUMENT);

    expect(result.orderItems).toHaveLength(1);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('retries and sends validation errors back to the model', async () => {
    extract
      .mockResolvedValueOnce({ orderItems: [{ ...VALID_ITEM, width: 0 }] })
      .mockResolvedValueOnce({ orderItems: [VALID_ITEM] });

    const result = await service.recognize(DOCUMENT);

    expect(result.orderItems[0].width).toBe(1200);
    expect(extract).toHaveBeenCalledTimes(2);
    const retry = extract.mock.calls[1][0] as { userPrompt: string };
    expect(retry.userPrompt).toContain('не прошёл проверку');
    expect(retry.userPrompt).toContain('width=0');
  });

  it('asks the fallback model after three failures', async () => {
    extract
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ orderItems: [VALID_ITEM] });

    await service.recognize(DOCUMENT);

    expect(extract).toHaveBeenCalledTimes(4);
    expect(extract.mock.calls[3][0]).toMatchObject({
      model: 'fallback-model',
    });
  });

  it('sanitizes the best answer when none is valid', async () => {
    extract.mockResolvedValue({ orderItems: [{ ...VALID_ITEM, width: 0 }] });

    const result = await service.recognize(DOCUMENT);

    expect(result.orderItems[0].width).toBe(500);
  });

  it('replaces a beveled window with an error code without retrying', async () => {
    extract.mockResolvedValue({
      orderItems: [{ constructionType: 'Окно со скосом' }],
    });

    const result = await service.recognize(DOCUMENT);

    expect(result.orderItems).toEqual([{ error: 1 }]);
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it('rejects the order when a block could not be read', async () => {
    reader.read.mockResolvedValue({
      blocks: [BLOCK, { ...BLOCK, blockNumber: 2 }],
      fullText: '',
      pageTexts: [],
    });
    extract.mockImplementation(({ images }: { images: Buffer[] }) =>
      Promise.resolve(
        images[0] === BLOCK.image ? { orderItems: [VALID_ITEM] } : null,
      ),
    );
    const second = { ...BLOCK, blockNumber: 2, image: Buffer.from('other') };
    reader.read.mockResolvedValue({
      blocks: [BLOCK, second],
      fullText: '',
      pageTexts: [],
    });

    await expect(service.recognize(DOCUMENT)).rejects.toThrow('изделие №2');
  });

  it('does not treat an empty page as an error', async () => {
    reader.read.mockResolvedValue({
      blocks: [BLOCK, { ...BLOCK, blockNumber: 2 }],
      fullText: '',
      pageTexts: [],
    });
    extract
      .mockResolvedValueOnce({ orderItems: [VALID_ITEM] })
      .mockResolvedValueOnce({ orderItems: [] });

    const result = await service.recognize(DOCUMENT);

    expect(result.orderItems).toHaveLength(1);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it('throws when no block contains items', async () => {
    extract.mockResolvedValue({ orderItems: [] });

    await expect(service.recognize(DOCUMENT)).rejects.toThrow(
      'изделия не найдены',
    );
  });

  it('throws when the document has no blocks', async () => {
    reader.read.mockResolvedValue({ blocks: [], fullText: '', pageTexts: [] });

    await expect(service.recognize(DOCUMENT)).rejects.toThrow(RecognitionError);
  });
});

describe('postprocessBlockItems', () => {
  it('decomposes a composite construction into one item', () => {
    const [item] = postprocessBlockItems(
      [{ ...VALID_ITEM, stvorka: undefined, width: 2400 }],
      {
        ...BLOCK,
        pageText: 'Изделие №1 2400 x 1400\nИзд.в констр.: 2,00шт.',
      },
      new Map(),
    );
    expect(item.width).toBe(1200);
  });

  it('applies a mosquito net by item number only', () => {
    const map = new Map([[1, [{ dims: null }]]]);
    const [item] = postprocessBlockItems([VALID_ITEM], BLOCK, map);
    expect(item.stvorka.isMoskit).toBe(true);

    const [scan] = postprocessBlockItems(
      [VALID_ITEM],
      { ...BLOCK, documentType: DocumentType.Image },
      map,
    );
    expect(scan.stvorka.isMoskit).toBeUndefined();
  });
});

describe('buildPhotoAdditionalItems', () => {
  it('inherits colors and keeps the longer side in thick', () => {
    const items = buildPhotoAdditionalItems(
      [
        { name: 'Подоконник', qu: 2, thick: 300, width: 1500 },
        { name: '', qu: 1 },
        { name: 'Отлив', qu: 0 },
      ],
      [{ colorIn: 'W', colorOut: 'R' }],
    );
    expect(items).toEqual([
      {
        name: 'Подоконник',
        colorIn: 'W',
        colorOut: 'R',
        qu: 2,
        thick: 1500,
        width: 300,
      },
    ]);
  });
});

describe('parseJsonResponse', () => {
  it('extracts JSON from a markdown block', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('returns null for a truncated response', () => {
    expect(parseJsonResponse('{"a":')).toBeNull();
  });
});
