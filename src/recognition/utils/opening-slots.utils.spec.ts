import {
  applyOpeningPredictions,
  buildOpeningSlots,
  matchSlotsToGlass,
} from './opening-slots.utils';

const WINDOW = {
  constructionType: 'Окно',
  width: 1000,
  height: 1000,
  vImposts: [{ x: 500, rightStvorka: { openType: 'pov', openSide: 'left' } }],
};
const left = { x: 0, y: 0, width: 100, height: 200 };
const right = { x: 110, y: 0, width: 100, height: 200 };

describe('buildOpeningSlots', () => {
  it('splits a window by vertical imposts', () => {
    const slots = buildOpeningSlots(structuredClone(WINDOW));

    expect(slots.map((slot) => [slot.x0, slot.x1])).toEqual([
      [0, 500],
      [500, 1000],
    ]);
    expect(slots[0].stvorka).toBeUndefined();
    expect(slots[1].stvorka).toEqual({ openType: 'pov', openSide: 'left' });
  });

  it('keeps a door leaf with an inner impost as one section', () => {
    const slots = buildOpeningSlots({
      width: 900,
      height: 2100,
      stvorka: { openSide: 'left', hImposts: [{ y: 700 }] },
    });
    expect(slots).toHaveLength(1);
  });

  it('builds zones and columns from horizontal imposts', () => {
    const slots = buildOpeningSlots({
      width: 1000,
      height: 2000,
      hImposts: [
        {
          y: 500,
          topImposts: [{ x: 400, leftStvorka: { openSide: 'left' } }],
        },
      ],
    });
    expect(slots.map((s) => [s.x0, s.y0, s.x1, s.y1])).toEqual([
      [0, 0, 1000, 500],
      [0, 500, 400, 2000],
      [400, 500, 1000, 2000],
    ]);
  });
});

describe('matchSlotsToGlass', () => {
  it('matches sections to glass by position', () => {
    const slots = buildOpeningSlots(structuredClone(WINDOW));
    expect(matchSlotsToGlass(WINDOW, slots, [right, left])).toEqual([
      left,
      right,
    ]);
  });

  it('gives up when the drawing does not fit the structure', () => {
    const slots = buildOpeningSlots(structuredClone(WINDOW));
    expect(matchSlotsToGlass(WINDOW, slots, [left])).toBeNull();
    expect(matchSlotsToGlass(WINDOW, slots, [])).toBeNull();
  });
});

describe('applyOpeningPredictions', () => {
  const run = (item: typeof WINDOW, names: Array<[string, number]>) => {
    applyOpeningPredictions(
      item,
      buildOpeningSlots(item),
      names.map(([name, confidence]) => ({ name, confidence })) as never,
    );
    return item.vImposts[0] as Record<string, unknown>;
  };

  it('corrects a confident answer', () => {
    const impost = run(structuredClone(WINDOW), [
      ['none', 0.99],
      ['down_right', 0.8],
    ]);
    expect(impost.rightStvorka).toEqual({
      openType: 'povOtk',
      openSide: 'right',
    });
  });

  it('keeps the model answer when confidence is low', () => {
    const impost = run(structuredClone(WINDOW), [
      ['none', 0.99],
      ['right', 0.5],
    ]);
    expect(impost.rightStvorka).toEqual({ openType: 'pov', openSide: 'left' });
  });

  it('adds a sash only with high confidence', () => {
    expect(
      run(structuredClone(WINDOW), [
        ['left', 0.8],
        ['none', 0.1],
      ]).leftStvorka,
    ).toBeUndefined();
    expect(
      run(structuredClone(WINDOW), [
        ['left', 0.95],
        ['none', 0.1],
      ]).leftStvorka,
    ).toEqual({ openType: 'pov', openSide: 'left' });
  });

  it('never makes an entrance door tilt and turn', () => {
    const door = {
      constructionType: 'Дверь входная открывание наружу',
      width: 900,
      height: 2100,
      stvorka: { openType: 'pov', openSide: 'left' },
    };
    applyOpeningPredictions(door, buildOpeningSlots(door), [
      { name: 'down_right', confidence: 0.99 },
    ]);
    expect(door.stvorka).toEqual({ openType: 'pov', openSide: 'right' });
  });
});
