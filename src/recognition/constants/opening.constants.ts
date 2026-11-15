export const CLASSIFIER_INPUT_SIZE = 224;

// Порядок классов задан при обучении модели
export const OPENING_CLASSES = [
  'down',
  'down_left',
  'down_right',
  'left',
  'none',
  'right',
  'up',
] as const;

// Уверенность модели: ниже порога остаётся ответ Gemini
export const OVERRIDE_CONFIDENCE = 0.75;
export const STRUCTURE_CONFIDENCE = 0.9;

// Мелкие области это подписи и обрезки стекла
export const MIN_GLASS_AREA_RATIO = 0.0008;
export const MIN_GLASS_SIDE_PX = 25;
export const MIN_GLASS_FILL_RATIO = 0.45;

// Типы открывания с боковым треугольником, у которых есть сторона петель
export const SIDE_OPENING_TYPES = new Set(['pov', 'povOtk']);
