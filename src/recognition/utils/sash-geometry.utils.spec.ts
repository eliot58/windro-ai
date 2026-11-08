import { RawImage } from '../recognition.types';
import { findSashApex } from './sash-geometry.utils';

// Рисует створку: тёмная рама, голубое стекло и треугольник с вершиной на нужной стороне
function drawSash(apex: 'left' | 'right'): RawImage {
  const width = 300;
  const height = 400;
  const data = Buffer.alloc(width * height * 3, 255);
  const paint = (x: number, y: number, rgb: number[]) =>
    data.set(rgb, (y * width + x) * 3);

  for (let y = 50; y < 350; y++)
    for (let x = 100; x < 220; x++) {
      const frame = x < 115 || x >= 205 || y < 65 || y >= 335;
      paint(x, y, frame ? [40, 40, 40] : [180, 250, 250]);
    }

  const apexX = apex === 'left' ? 107 : 212;
  const farX = apex === 'left' ? 203 : 117;
  for (const farY of [67, 332])
    for (let t = 0; t <= 1; t += 0.001) {
      const x = Math.round(apexX + (farX - apexX) * t);
      const y = Math.round(200 + (farY - 200) * t);
      paint(x, y, [0, 0, 0]);
    }
  return { data, width, height };
}

describe('findSashApex', () => {
  it('finds the triangle apex side', () => {
    expect(findSashApex(drawSash('left'))).toBe('left');
    expect(findSashApex(drawSash('right'))).toBe('right');
  });

  it('returns nothing without a frame', () => {
    const blank = {
      data: Buffer.alloc(100 * 100 * 3, 255),
      width: 100,
      height: 100,
    };
    expect(findSashApex(blank)).toBeUndefined();
  });
});
