export const UNSUPPORTED_BEVELED_WINDOW = 1;

export const UNSUPPORTED_ARCHED_WINDOW = 2;

// Дверная фрамуга меньше этого размера декоративная и импостом не считается
export const SMALL_TRANSOM_MM = 350;

export const WHITE_COLORS = new Set(['w', 'белая основа', 'белый', 'белая']);

export const V_FILLS = ['leftFill', 'rightFill'];

export const H_FILLS = ['bottomFill', 'topFill'];

export const V_STVORKAS = ['leftStvorka', 'rightStvorka'];

export const H_STVORKAS = ['bottomStvorka', 'topStvorka'];

export const SUB_IMPOSTS = ['topImposts', 'bottomImposts'];

export const FURNITURE_BRANDS: Record<string, string> = {
  ворне: 'VORNE',
  ворнэ: 'VORNE',
  vorne: 'VORNE',
  рото: 'ROTO',
  roto: 'ROTO',
  фут: 'FUTURUSS',
  футурусс: 'FUTURUSS',
  futuruss: 'FUTURUSS',
  мако: 'MACO',
  maco: 'MACO',
};

export const EMPTY_FURNITURE = new Set([
  'None',
  'не указана',
  'не указано',
  'нет',
  '????',
]);

export const DOOR_FURNITURE_MARKERS = [
  'Нажимной гарнитур',
  'МЗО',
  'петли',
  'REZE',
  'Elementis',
  'Кл-Врт',
  '+',
];

export const COLOR_ONLY =
  /^(белый|белая|белая\s+основа|серый|тёмно[- ]серый|темно[- ]серый|коричневый|бежевый|чёрный|черный|антрацит[\p{L}\p{N}_]*|вишня|лиственница[\p{L}\p{N}_]*|дуб[\p{L}\p{N}_]*|сосна[\p{L}\p{N}_]*|цвет[\p{L}\p{N}_]*|махагон[\p{L}\p{N}_]*)$/iu;

export const SANDWICH_WORD = /с[эе]ндвич|сандвич|sandwich/iu;

export const SANDWICH_BARE = /^[sс][.\s]*$/iu;

export const SANDWICH_LETTER = /^[sс][\s.-]*\d+\s*(?:мм)?$/iu;

// Минимальное расстояние между рамой и импостом и между соседними импостами.
// Реальный минимум на эталонах 500 мм, порог ловит раскладку, принятую за импост
export const MIN_IMPOST_DISTANCE = 200;

// Сервер КП падает на нулевом размере, поэтому неточный размер лучше нуля
export const DIMENSION_FALLBACK = 500;

export const ITEM_FIELDS = new Set([
  'constructionType',
  'profileName',
  'furnitureName',
  'fill',
  'fillParam',
  'qu',
  'width',
  'height',
  'colorIn',
  'colorOut',
  'stvorka',
  'vImposts',
  'hImposts',
]);

export const STVORKA_FIELDS = new Set([
  'openType',
  'openSide',
  'isMoskit',
  'hImposts',
  'fill',
  'fillParam',
]);

export const VIMPOST_FIELDS = new Set([
  'x',
  'leftStvorka',
  'rightStvorka',
  'leftFill',
  'rightFill',
  'leftFillParam',
  'rightFillParam',
]);

export const HIMPOST_FIELDS = new Set([
  'y',
  'bottomStvorka',
  'topStvorka',
  'topImposts',
  'bottomImposts',
  'bottomFill',
  'topFill',
  'bottomFillParam',
  'topFillParam',
]);

export const FILL_PARAM_FIELDS = new Set(['marking', 'colorIn', 'colorOut']);

export const OPEN_TYPES = new Set(['pov', 'povOtk', 'gluh']);

export const OPEN_SIDES = new Set(['left', 'right']);

export const CONSTRUCTION_TYPES = new Set([
  'Окно',
  'Балконная дверь',
  'Дверь балконная',
  'Дверь входная открывание наружу',
  'Дверь входная открывание вовнутрь',
]);

export const REQUIRED_FIELDS = ['constructionType', 'width', 'height', 'qu'];
