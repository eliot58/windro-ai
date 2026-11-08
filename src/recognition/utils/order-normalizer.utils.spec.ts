import {
  fixSwappedDimensions,
  normalizeFurnitureName,
  normalizeProfileName,
  normalizeSectionFill,
} from './order-normalizer.utils';

describe('fixSwappedDimensions', () => {
  it('swaps window dimensions when an impost does not fit', () => {
    const item = {
      constructionType: 'Окно',
      width: 800,
      height: 2000,
      vImposts: [{ x: 1000 }],
    };
    expect(fixSwappedDimensions(item)).toMatchObject({
      width: 2000,
      height: 800,
    });
  });

  it('keeps the window when imposts fit', () => {
    const item = {
      constructionType: 'Окно',
      width: 800,
      height: 2000,
      vImposts: [{ x: 400 }],
    };
    expect(fixSwappedDimensions(item)).toMatchObject({
      width: 800,
      height: 2000,
    });
  });

  it('keeps the window when swapping does not help', () => {
    const item = {
      constructionType: 'Окно',
      width: 800,
      height: 900,
      vImposts: [{ x: 1000 }],
    };
    expect(fixSwappedDimensions(item)).toMatchObject({
      width: 800,
      height: 900,
    });
  });

  it('makes a door taller than it is wide', () => {
    const item = {
      constructionType: 'Балконная дверь',
      width: 2100,
      height: 800,
    };
    expect(fixSwappedDimensions(item)).toMatchObject({
      width: 800,
      height: 2100,
    });
  });
});

describe('name normalization', () => {
  it('takes the profile system after the separator', () => {
    expect(normalizeProfileName('70 Rehau / Серия / Grazio')).toBe('Grazio');
  });

  it('maps sandwich to S only where it is safe', () => {
    expect(normalizeSectionFill('Сэндвич24', false)).toBe('S');
    expect(normalizeSectionFill('С 32', true)).toBe('S');
    expect(normalizeSectionFill('С 32', false)).toBe('С 32');
  });
});

describe('text normalization', () => {
  it('drops spaces after dots in furniture names', () => {
    expect(normalizeFurnitureName('НАЖ. ГАР. DR 35', true)).toBe(
      'НАЖ.ГАР.DR 35',
    );
  });

  it('fixes Cyrillic letters inside Latin words of a fill', () => {
    expect(normalizeSectionFill('4x14x4ТорNх14x4 кал.', false)).toBe(
      '4x14x4TopNx14x4 кал.',
    );
    expect(normalizeSectionFill('4М1-16-4М1', false)).toBe('4М1-16-4М1');
    expect(normalizeSectionFill('4x14x4TopNx14x4Кал.', false)).toBe(
      '4x14x4TopNx14x4Кал.',
    );
  });
});
