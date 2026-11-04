import { DocumentType } from '../recognition.types';

export const RENDER_DPI = 200;

export const CONVERT_TIMEOUT_MS = 120_000;

// Пустая удалённая позиция содержит меньше 1% контента, настоящий блок больше 5%
export const MIN_CONTENT_RATIO = 0.02;

export const START_PATTERNS: Partial<Record<DocumentType, RegExp>> = {
  [DocumentType.Proposal]: /Поз\s*№\s*(\d+)/gu,
  [DocumentType.ShortProposal]: /№(\d+)/gu,
  [DocumentType.Calculation]: /Изделие\s*№\s*(\d+)/gu,
  // Цифра перед «Изделие № / Количество:» это количество, а не номер позиции
  [DocumentType.TechnicalSpec]: /(\d+)\s*\n\s*Изделие\s*№\s*\n\s*Фурнитура/gu,
};

export const TECHNICAL_SPEC_FALLBACK = /(\d+)\s*\n\s*Изделие\s*№/gu;

export const END_PATTERNS: Partial<Record<DocumentType, RegExp[]>> = {
  [DocumentType.Proposal]: [
    /Стоимость изделия/gu,
    /Поз\s*№\s*\d+/gu,
    /Итого стоимость/gu,
    /Работы/gu,
  ],
  [DocumentType.ShortProposal]: [/Стоимость изделия/gu, /№\d+/gu, /Итого/gu],
  [DocumentType.Calculation]: [
    /Код\s*\/\s*цвет изделия/gu,
    /Изделие\s*№\s*\d+/gu,
    /Москитные сетки/gu,
    /Комплектующие изделий/gu,
    /Комплектующие/gu,
    /[Ии][Тт][Оо][Гг][Оо]/gu,
  ],
  [DocumentType.TechnicalSpec]: [
    /Вид изделия со стороны/gu,
    /\d+\s*\n\s*Изделие\s*№/gu,
    /Наименование\s+Цена/gu,
  ],
};

// Подпись в конце блока относится к нему самому: область расширяется за строку
export const FOOTER_LINES: Partial<
  Record<DocumentType, { texts: string[]; margin: number }>
> = {
  [DocumentType.Proposal]: { texts: ['Стоимость изделия'], margin: 30 },
  [DocumentType.ShortProposal]: { texts: ['Стоимость изделия'], margin: 30 },
  [DocumentType.Calculation]: {
    texts: ['Код / цвет изделия', 'Код/цвет изделия'],
    margin: 20,
  },
  [DocumentType.TechnicalSpec]: {
    texts: ['Вид изделия со стороны'],
    margin: 20,
  },
};

export const WINDOW_WORDS =
  /Окно|окно|Дверь|дверь|Створка|створка|Рама|рама|Спецификация|спецификация|профил|Профил|[Сс]т[/её]кл|[Фф]урнитур|Заполнени/u;
