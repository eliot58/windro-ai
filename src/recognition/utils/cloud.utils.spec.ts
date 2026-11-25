import { mergeClouds, readCloud } from './cloud.utils';

describe('cloud', () => {
  const [a, b, c] = [{ width: 1 }, { width: 2 }, { width: 3 }];

  it('ignores a missing or non-string cloud', () => {
    expect(readCloud({})).toBe('');
    expect(readCloud({ cloud: { x: 1 } })).toBe('');
    expect(readCloud({ cloud: ' текст ' })).toBe('текст');
  });

  it('renumbers positions of later blocks', () => {
    expect(
      mergeClouds(
        [
          { cloud: 'Позиция 1: высота изменена с 3140 на 3000', items: [a] },
          { cloud: '', items: [] },
          { cloud: 'Позиции 1–2: разделено на 2 рамы; Общее', items: [b, c] },
        ],
        [a, b, c],
      ),
    ).toBe(
      'Позиция 1: высота изменена с 3140 на 3000; Позиции 2–3: разделено на 2 рамы; Общее',
    );
  });

  it('drops notes about removed duplicates', () => {
    expect(
      mergeClouds(
        [
          { cloud: 'Позиция 1: арка', items: [a] },
          { cloud: 'Позиция 1: арка; Позиция 2: портал', items: [b, c] },
        ],
        [a, c],
      ),
    ).toBe('Позиция 1: арка; Позиция 2: портал');
  });
});
