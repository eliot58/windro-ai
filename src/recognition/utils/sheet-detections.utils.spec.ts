import { planOpeningCrops, sortByRows } from './sheet-detections.utils';

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe('sortByRows', () => {
  it('reads rows top to bottom and left to right', () => {
    const a = box(500, 10, 100, 100);
    const b = box(10, 20, 100, 100);
    const c = box(10, 300, 100, 100);
    expect(sortByRows([c, a, b])).toEqual([b, a, c]);
  });
});

describe('planOpeningCrops', () => {
  const sheetItem = {
    box: box(0, 0, 300, 200),
    sections: [box(0, 0, 150, 200), box(150, 0, 150, 200)],
  };

  it('looks at a single sash as a whole', () => {
    expect(
      planOpeningCrops({ stvorka: { openSide: 'left' } }, sheetItem),
    ).toEqual([sheetItem.box]);
  });

  it('uses detected sections when their count matches the imposts', () => {
    expect(planOpeningCrops({ vImposts: [{ x: 500 }] }, sheetItem)).toEqual(
      sheetItem.sections,
    );
  });

  it('gives up when a column has no detected section', () => {
    expect(
      planOpeningCrops(
        { width: 900, vImposts: [{ x: 300 }, { x: 600 }] },
        sheetItem,
      ),
    ).toBeNull();
  });

  it('ignores a false box spanning several columns', () => {
    const crops = planOpeningCrops(
      { width: 1000, vImposts: [{ x: 500 }] },
      {
        box: box(0, 0, 300, 200),
        sections: [
          box(0, 0, 150, 200),
          box(60, 0, 200, 200),
          box(150, 0, 150, 200),
        ],
      },
    );
    expect(crops).toEqual([box(0, 0, 150, 200), box(150, 0, 150, 200)]);
  });

  it('glues pieces of one section split by the detector', () => {
    const crops = planOpeningCrops(
      { width: 1000, vImposts: [{ x: 500 }] },
      {
        box: box(0, 0, 300, 200),
        sections: [
          box(0, 0, 150, 90),
          box(0, 100, 150, 100),
          box(150, 0, 150, 200),
        ],
      },
    );
    expect(crops).toEqual([box(0, 0, 150, 200), box(150, 0, 150, 200)]);
  });

  it('skips items with horizontal imposts', () => {
    expect(planOpeningCrops({ hImposts: [{ y: 500 }] }, sheetItem)).toBeNull();
  });

  it('merges sections of a sash that has its own horizontal impost', () => {
    const crops = planOpeningCrops(
      {
        width: 1000,
        vImposts: [
          { x: 500, leftStvorka: { openSide: 'left', hImposts: [{ y: 400 }] } },
        ],
      },
      {
        box: box(0, 0, 300, 200),
        sections: [
          box(0, 0, 150, 80),
          box(0, 80, 150, 120),
          box(150, 0, 150, 200),
        ],
      },
    );
    expect(crops).toEqual([box(0, 0, 150, 200), box(150, 0, 150, 200)]);
  });
});
