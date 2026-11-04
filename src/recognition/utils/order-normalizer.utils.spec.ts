import {
  fixSwappedDimensions,
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
