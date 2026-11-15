export const WORD_END = '(?![\\p{L}\\p{N}_])';

const WORD_CHARS = '[\\p{L}\\p{N}_]*';

export const NET_FIELD =
  /^\s*(?:Тип\s+москитной\s+сетки|Полотно\s+МС)\s*[:-]?\s*(.*)$/iu;

export const MC_VALUE = /^\s*МС\s+(\S.*?)\s*$/u;

export const LABEL_LOOKING = new RegExp(
  `^\\s*(?:Тип|Цвет|Вид|Вариант|Система|Кол-во|Количество)${WORD_END}|:\\s*$|(?<![\\p{L}\\p{N}_])МС\\s*$`,
  'iu',
);

export const PRODUCT_NAME = new RegExp(
  `^\\s*(?:Окно|Балконн${WORD_CHARS}\\s+дверь|Балконн${WORD_CHARS}\\s+блок|Дверь|Витраж|Лоджия|Изделие)${WORD_END}`,
  'iu',
);

export const NET_TOKEN = new RegExp(
  `москит${WORD_CHARS}\\s+сет${WORD_CHARS}`,
  'iu',
);

export const PROFSTROY_ROW =
  /(?:^|\n)\s*(\d+)\s*\n\s*Москитная\s+сетка\s*(?:\(([^)]*)\))?\s*(\d+)\s*\/\s*(\d+)/gu;

export const NEGATIVE_WORDS = ['нет', 'без', 'не ставится', '-', '—', '–'];

export const NEGATIVE_STEMS = ['не требует', 'не устанавлив', 'отсутству'];

// Латиница, похожая на кириллицу: OCR пишет «Системa» с латинской a
export const HOMOGLYPHS: Record<string, string> = {
  a: 'а',
  A: 'А',
  e: 'е',
  E: 'Е',
  o: 'о',
  O: 'О',
  c: 'с',
  C: 'С',
  T: 'Т',
  B: 'В',
  K: 'К',
  M: 'М',
};
