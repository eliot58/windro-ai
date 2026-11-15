export const PDF_SECTION = 'Дополнительные изделия и материалы';

export const DOCX_SECTION = 'Дополнительная продукция к заказу';

const WORD = '[\\p{L}\\p{N}_]';

export const COLOR = new RegExp(
  `(${WORD}[\\p{L}\\p{N}_.\\s]*?\\/${WORD}[\\p{L}\\p{N}_.\\s]*?\\/${WORD}[\\p{L}\\p{N}_.\\s]*?)\\s*$`,
  'u',
);

export const COST = /^\d[\d\s]*,\d+$/u;

export const SIZE_PAIR = /^(\d[\d\s]*)\s*[xх]\s*(\d[\d\s]*)$/iu;

export const SIZE_SINGLE = /^(\d[\d\s]*)$/u;

export const QUANTITY = /^(\d+)$/u;

// Дата в колонтитуле попадает в текст таблицы при переносе на новую страницу
export const PAGE_FOOTER = /^Page\s+\d+|^file:\/\/\/|^\d{2}\.\d{2}\.\d{4}$/u;

export const COLUMN_HEADERS = new Set([
  'Наименование',
  'Изд',
  '№',
  'Кол-',
  'во',
  'Размер, мм',
  'Стоимость',
  'Размер, мм Стоимость',
  'Кол-во',
]);
