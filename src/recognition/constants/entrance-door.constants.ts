export const DOOR_OUTWARD = 'Дверь входная открывание наружу';
export const DOOR_INWARD = 'Дверь входная открывание во внутрь';
// Так тип называли раньше, его пишет модель по документам
export const DOOR_INWARD_LEGACY = 'Дверь входная открывание вовнутрь';

export const DOOR_PROFILE = 'Входная дверь';
export const DOOR_FURNITURE = 'Фурнитура Дверная';

export const NOT_SPECIFIED = 'не указано';

// Порядок и значения по умолчанию из ТЗ на входные двери: принимающая система
// ждёт ровно эти шесть параметров в этом порядке
export const DOOR_PARAMETERS = {
  handle: { name: 'Тип дверной ручки', fallback: NOT_SPECIFIED },
  lock: { name: 'Замок', fallback: NOT_SPECIFIED },
  cylinder: { name: 'Цилиндр', fallback: 'Ключ-Ключ' },
  hinges: { name: 'Петли', fallback: 'Elementis' },
  hingeCount: { name: 'Количество петель', fallback: NOT_SPECIFIED },
  closer: { name: 'Доводчик', fallback: 'Не ставить' },
} as const;

export const CLOSER_ON = 'Ставить';
