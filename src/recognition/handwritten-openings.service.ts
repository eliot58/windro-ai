import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import { InferenceSession, Tensor } from 'onnxruntime-node';
import sharp from 'sharp';

import {
  DETECTOR_INPUT_SIZE,
  HANDWRITTEN_CLASSES,
  HANDWRITTEN_INPUT_SIZE,
  HANDWRITTEN_THRESHOLDS,
  MIN_SECTION_SIDE_PX,
  SECTION_MARGIN_RATIO,
} from './constants/handwritten.constants';
import {
  OpeningPrediction,
  OrderItem,
  PixelBox,
  RawImage,
} from './recognition.types';
import {
  applyOpeningPredictions,
  buildOpeningSlots,
} from './utils/opening-slots.utils';
import { normalizeStvorkaPositions } from './utils/order-normalizer.utils';
import { validateOrderItems } from './utils/order-validator.utils';
import {
  parseSheetDetections,
  planOpeningCrops,
} from './utils/sheet-detections.utils';

// Уменьшение усреднением по площади, как cv2.INTER_AREA при обучении
function toClassifierInput(image: RawImage, box: PixelBox): Tensor {
  const size = HANDWRITTEN_INPUT_SIZE;
  const plane = size * size;
  const data = new Float32Array(3 * plane);
  const scaleX = box.width / size;
  const scaleY = box.height / size;

  for (let y = 0; y < size; y++) {
    const y0 = box.y + y * scaleY;
    const y1 = y0 + scaleY;
    for (let x = 0; x < size; x++) {
      const x0 = box.x + x * scaleX;
      const x1 = x0 + scaleX;
      const sum = [0, 0, 0];
      let weight = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0));
          const offset =
            (Math.min(sy, image.height - 1) * image.width +
              Math.min(sx, image.width - 1)) *
            3;
          for (let c = 0; c < 3; c++) sum[c] += image.data[offset + c] * w;
          weight += w;
        }
      }
      for (let c = 0; c < 3; c++) {
        data[c * plane + y * size + x] = sum[c] / weight / 255;
      }
    }
  }
  return new Tensor('float32', data, [1, 3, size, size]);
}

function toPrediction(logits: Float32Array): OpeningPrediction {
  const max = Math.max(...logits);
  const exps = Array.from(logits, (value) => Math.exp(value - max));
  const sum = exps.reduce((total, value) => total + value, 0);
  const best = exps.indexOf(Math.max(...exps));
  return {
    name: HANDWRITTEN_CLASSES[best],
    confidence: exps[best] / sum,
  };
}

// Проверяет открывания на фото рукописных бланков: детектор находит изделия
// и секции, рукописная модель смотрит на каждую. Любая неоднозначность или
// сбой оставляют ответ Gemini как есть
@Injectable()
export class HandwrittenOpeningsService {
  private readonly logger = new Logger(HandwrittenOpeningsService.name);
  private detector?: Promise<InferenceSession>;
  private classifier?: Promise<InferenceSession>;

  async correct(items: OrderItem[], png: Buffer): Promise<void> {
    try {
      const { data, info } = await sharp(png)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const image = { data, width: info.width, height: info.height };

      const sheet = await this.detect(png, image);
      if (!sheet || sheet.length !== items.length) return;

      for (const [index, item] of items.entries()) {
        await this.correctItem(item, image, sheet[index]);
      }
    } catch (error) {
      this.logger.warn(
        `Проверка открываний на фото не удалась: ${String(error)}`,
      );
    }
  }

  private async correctItem(
    item: OrderItem,
    image: RawImage,
    sheetItem: NonNullable<ReturnType<typeof parseSheetDetections>>[number],
  ) {
    const crops = planOpeningCrops(item, sheetItem);
    const slots = buildOpeningSlots(item);
    if (!crops || crops.length !== slots.length) return;

    const predictions: OpeningPrediction[] = [];
    for (const crop of crops) {
      if (
        crop.width < MIN_SECTION_SIDE_PX ||
        crop.height < MIN_SECTION_SIDE_PX
      ) {
        return;
      }
      predictions.push(
        await this.classify(image, this.withMargin(crop, image)),
      );
    }

    const original = structuredClone(item);
    applyOpeningPredictions(item, slots, predictions, HANDWRITTEN_THRESHOLDS);
    normalizeStvorkaPositions(item);
    if (validateOrderItems([item]).length) {
      for (const key of Object.keys(item)) delete item[key];
      Object.assign(item, original);
    }
  }

  private withMargin(box: PixelBox, image: RawImage): PixelBox {
    const marginX = Math.floor(box.width * SECTION_MARGIN_RATIO);
    const marginY = Math.floor(box.height * SECTION_MARGIN_RATIO);
    const x = Math.max(0, Math.round(box.x - marginX));
    const y = Math.max(0, Math.round(box.y - marginY));
    return {
      x,
      y,
      width: Math.min(image.width, Math.round(box.x + box.width + marginX)) - x,
      height:
        Math.min(image.height, Math.round(box.y + box.height + marginY)) - y,
    };
  }

  private async detect(png: Buffer, image: RawImage) {
    const size = DETECTOR_INPUT_SIZE;
    const scale = Math.min(size / image.width, size / image.height);
    const padX = Math.floor((size - Math.round(image.width * scale)) / 2);
    const padY = Math.floor((size - Math.round(image.height * scale)) / 2);

    // Как при обучении: пропорции сохраняются, поля заливаются серым
    const { data } = await sharp(png)
      .removeAlpha()
      .resize(size, size, {
        fit: 'contain',
        background: { r: 114, g: 114, b: 114 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const plane = size * size;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      for (let c = 0; c < 3; c++) input[c * plane + i] = data[i * 3 + c] / 255;
    }

    this.detector ??= InferenceSession.create(
      join(__dirname, 'models/sheet-detector.onnx'),
    );
    const { output } = await (
      await this.detector
    ).run({ images: new Tensor('float32', input, [1, 3, size, size]) });

    return parseSheetDetections(
      output.data as Float32Array,
      output.dims[2],
      (box) => ({
        x: (box.x - padX) / scale,
        y: (box.y - padY) / scale,
        width: box.width / scale,
        height: box.height / scale,
      }),
    );
  }

  private async classify(
    image: RawImage,
    box: PixelBox,
  ): Promise<OpeningPrediction> {
    this.classifier ??= InferenceSession.create(
      join(__dirname, 'models/handwritten-opening-classifier.onnx'),
    );
    const { logits } = await (
      await this.classifier
    ).run({ input: toClassifierInput(image, box) });
    return toPrediction(logits.data as Float32Array);
  }
}
