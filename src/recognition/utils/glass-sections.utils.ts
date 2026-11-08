import {
  MIN_GLASS_AREA_RATIO,
  MIN_GLASS_FILL_RATIO,
  MIN_GLASS_SIDE_PX,
} from '../constants/opening.constants';
import { PixelBox, RawImage } from '../recognition.types';

// Стекло на чертежах залито голубым, зелёным или жёлтым, панели серые
function isGlassPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const saturation = max === 0 ? 0 : (delta * 255) / max;

  if (saturation < 25) return max >= 90 && max <= 175;
  if (saturation < 30 || delta === 0) return false;

  let hue: number;
  if (max === r) hue = (60 * (g - b)) / delta;
  else if (max === g) hue = 120 + (60 * (b - r)) / delta;
  else hue = 240 + (60 * (r - g)) / delta;
  hue = (hue < 0 ? hue + 360 : hue) / 2;

  const isBlue = hue >= 80 && hue <= 110 && max >= 100;
  const isGreenOrYellow = hue >= 25 && hue <= 80 && max >= 150;
  return isBlue || isGreenOrYellow;
}

// Морфология по строкам и столбцам: pick = 0 сужает маску, pick = 1 расширяет
export function morph(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  pick: 0 | 1,
): Uint8Array {
  const pass = (source: Uint8Array, step: number) => {
    const target = new Uint8Array(source.length);
    const line = step === 1 ? width : height;
    for (let i = 0; i < source.length; i++) {
      const position = step === 1 ? i % width : Math.floor(i / width);
      let value = 1 - pick;
      for (let d = -radius; d <= radius; d++) {
        const next = position + d;
        if (next < 0 || next >= line) continue;
        if (source[i + d * step] === pick) {
          value = pick;
          break;
        }
      }
      target[i] = value;
    }
    return target;
  };
  return pass(pass(mask, 1), width);
}

// Находит связные области стекла и возвращает их границы
export function findGlassBoxes({ data, width, height }: RawImage): PixelBox[] {
  let mask: Uint8Array = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 3;
    mask[i] = isGlassPixel(data[offset], data[offset + 1], data[offset + 2])
      ? 1
      : 0;
  }

  // Открытие убирает тонкие линии, закрытие заделывает разрывы от сетки и подписей
  mask = morph(morph(mask, width, height, 1, 0), width, height, 1, 1);
  mask = morph(morph(mask, width, height, 2, 1), width, height, 2, 0);

  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const minArea = MIN_GLASS_AREA_RATIO * width * height;
  const boxes: PixelBox[] = [];

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    let size = 0;
    let top = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    stack[top++] = start;
    visited[start] = 1;

    while (top > 0) {
      const index = stack[--top];
      const x = index % width;
      const y = Math.floor(index / width);
      size++;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            stack[top++] = next;
          }
        }
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (
      size > minArea &&
      boxWidth > MIN_GLASS_SIDE_PX &&
      boxHeight > MIN_GLASS_SIDE_PX &&
      size > MIN_GLASS_FILL_RATIO * boxWidth * boxHeight
    ) {
      boxes.push({ x: minX, y: minY, width: boxWidth, height: boxHeight });
    }
  }
  return boxes;
}

// Границы общей области нескольких стёкол
export function unionBox(boxes: PixelBox[]): PixelBox {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}
