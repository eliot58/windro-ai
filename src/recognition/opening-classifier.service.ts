import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import sharp from 'sharp';

import {
  CLASSIFIER_INPUT_SIZE,
  OPENING_CLASSES,
  SIDE_OPENING_TYPES,
} from './constants/opening.constants';
import {
  OpeningPrediction,
  OrderItem,
  PixelBox,
  RawImage,
} from './recognition.types';
import { findGlassBoxes } from './utils/glass-sections.utils';
import { isObject } from './utils/guards.utils';
import {
  applyOpeningPredictions,
  buildOpeningSlots,
  matchSlotsToGlass,
} from './utils/opening-slots.utils';
import { validateOrderItems } from './utils/order-validator.utils';
import { findSashApex } from './utils/sash-geometry.utils';

// Вырезает область и готовит тензор как при обучении: каналы BGR, значения 0..1,
// билинейное масштабирование меньшей стороны до 224
function toInput(image: RawImage, box: PixelBox): Tensor {
  const shortSide = Math.min(box.width, box.height);
  const outWidth = Math.floor((CLASSIFIER_INPUT_SIZE * box.width) / shortSide);
  const outHeight = Math.floor(
    (CLASSIFIER_INPUT_SIZE * box.height) / shortSide,
  );
  const scaleX = box.width / outWidth;
  const scaleY = box.height / outHeight;
  const plane = outWidth * outHeight;
  const data = new Float32Array(3 * plane);

  for (let y = 0; y < outHeight; y++) {
    const sourceY = Math.max((y + 0.5) * scaleY - 0.5, 0);
    const y0 = Math.min(Math.floor(sourceY), box.height - 1);
    const y1 = Math.min(y0 + 1, box.height - 1);
    const dy = sourceY - y0;

    for (let x = 0; x < outWidth; x++) {
      const sourceX = Math.max((x + 0.5) * scaleX - 0.5, 0);
      const x0 = Math.min(Math.floor(sourceX), box.width - 1);
      const x1 = Math.min(x0 + 1, box.width - 1);
      const dx = sourceX - x0;

      for (let channel = 0; channel < 3; channel++) {
        const read = (px: number, py: number) =>
          image.data[
            ((box.y + py) * image.width + box.x + px) * 3 + (2 - channel)
          ];
        const value =
          (read(x0, y0) * (1 - dx) + read(x1, y0) * dx) * (1 - dy) +
          (read(x0, y1) * (1 - dx) + read(x1, y1) * dx) * dy;
        data[channel * plane + y * outWidth + x] = value / 255;
      }
    }
  }
  return new Tensor('float32', data, [1, 3, outHeight, outWidth]);
}

function toPrediction(logits: Float32Array): OpeningPrediction {
  const max = Math.max(...logits);
  const exps = Array.from(logits, (value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  const best = exps.indexOf(Math.max(...exps));
  return { name: OPENING_CLASSES[best], confidence: exps[best] / sum };
}

// У одностворчатого изделия сторону петель надёжнее определить по линиям чертежа:
// вершина бокового треугольника стоит у ручки, петли напротив.
// Работает и на сканах, где стекло не залито цветом
function correctSingleSashSide(item: OrderItem, image: RawImage): void {
  const imposts = [item.vImposts, item.hImposts] as unknown[];
  if (imposts.some((list) => Array.isArray(list) && list.length)) return;
  const stvorka: unknown = item.stvorka;
  if (!isObject(stvorka)) return;
  if (!SIDE_OPENING_TYPES.has(String(stvorka.openType))) return;
  if (stvorka.openSide !== 'left' && stvorka.openSide !== 'right') return;

  const apex = findSashApex(image);
  if (apex) stvorka.openSide = apex === 'left' ? 'right' : 'left';
}

// Gemini путает открывания на чертежах, поэтому их проверяет локальная модель.
// Любой сбой здесь не мешает заказу: остаётся ответ Gemini
@Injectable()
export class OpeningClassifierService {
  private readonly logger = new Logger(OpeningClassifierService.name);
  private session?: Promise<InferenceSession>;

  async correct(item: OrderItem, png: Buffer): Promise<void> {
    try {
      const { data, info } = await sharp(png)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const image = { data, width: info.width, height: info.height };

      const original = structuredClone(item);
      const slots = buildOpeningSlots(item);
      const boxes = matchSlotsToGlass(item, slots, findGlassBoxes(image));
      if (boxes) {
        const predictions: OpeningPrediction[] = [];
        for (const box of boxes)
          predictions.push(await this.classify(image, box));
        applyOpeningPredictions(item, slots, predictions);
      }
      correctSingleSashSide(item, image);

      if (validateOrderItems([item]).length) {
        for (const key of Object.keys(item)) delete item[key];
        Object.assign(item, original);
      }
    } catch (error) {
      this.logger.warn(`Проверка открываний не удалась: ${String(error)}`);
    }
  }

  private async classify(
    image: RawImage,
    box: PixelBox,
  ): Promise<OpeningPrediction> {
    this.session ??= InferenceSession.create(
      join(__dirname, 'models/opening-classifier.onnx'),
    );
    const session = await this.session;
    const { logits } = await session.run({ input: toInput(image, box) });
    return toPrediction(logits.data as Float32Array);
  }
}
