export const DETECTOR_INPUT_SIZE = 960;
export const DETECTOR_CONFIDENCE = 0.35;
export const DETECTOR_IOU = 0.7;

// Каналы ответа детектора: 4 рамка изделия, 5 секция
export const ITEM_CHANNEL = 4;
export const SECTION_CHANNEL = 5;

export const HANDWRITTEN_INPUT_SIZE = 224;

// Порядок классов задан при обучении рукописной модели
export const HANDWRITTEN_CLASSES = [
  'none',
  'left',
  'right',
  'down_left',
  'down_right',
  'up',
  'down',
] as const;

// На рукописных бланках модель ошибается чаще, поэтому пороги строже, чем на чертежах
export const HANDWRITTEN_THRESHOLDS = {
  override: 0.75,
  add: 0.85,
  remove: 0.75,
};

export const SECTION_MARGIN_RATIO = 0.04;
export const MIN_SECTION_SIDE_PX = 40;
