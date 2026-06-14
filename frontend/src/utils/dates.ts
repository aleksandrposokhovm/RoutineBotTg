const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTHS_RU_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function getMonthName(month: number): string {
  // eslint-disable-next-line security/detect-object-injection
  return MONTHS_RU[month];
}

export function getMonthNameGenitive(month: number): string {
  // eslint-disable-next-line security/detect-object-injection
  return MONTHS_RU_GENITIVE[month];
}

export function getWeekdayShort(dayIndex: number): string {
  // eslint-disable-next-line security/detect-object-injection
  return WEEKDAYS_SHORT[dayIndex];
}

export function getWeekdays(): string[] {
  return WEEKDAYS_SHORT;
}

/**
 * Формат: "2026-06-11"
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Формат: "11 июня 2026"
 */
export function formatDateHuman(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_RU_GENITIVE[m - 1]} ${y}`;
}

/**
 * Формат: "11 июня"
 */
export function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_RU_GENITIVE[m - 1]}`;
}

/**
 * Парсим "YYYY-MM-DD" -> Date
 */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Проверяем, сегодня ли это
 */
export function isToday(dateStr: string): boolean {
  return dateStr === formatDate(new Date());
}

/**
 * Получить все дни месяца + padding для сетки
 */
export function getMonthGrid(year: number, month: number): {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
}[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Понедельник = 0, Вс = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const result = [];

  // Дни из предыдущего месяца
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    result.push({ date: d, dateStr: formatDate(d), isCurrentMonth: false });
  }

  // Дни текущего месяца
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    result.push({ date: d, dateStr: formatDate(d), isCurrentMonth: true });
  }

  // Дни следующего месяца (до 42 ячеек = 6 недель)
  const remaining = 42 - result.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    result.push({ date: d, dateStr: formatDate(d), isCurrentMonth: false });
  }

  return result;
}

/**
 * Получить дни текущей недели (Пн–Вс) для указанной даты
 */
export function getWeekDays(date: Date): {
  date: Date;
  dateStr: string;
}[] {
  const d = new Date(date);
  let dow = d.getDay() - 1;
  if (dow < 0) dow = 6;

  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);

  const result = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    result.push({ date: day, dateStr: formatDate(day) });
  }

  return result;
}

/**
 * Получить начало и конец недели
 */
export function getWeekRange(date: Date): { start: string; end: string } {
  const week = getWeekDays(date);
  return {
    start: week[0].dateStr,
    end: week[6].dateStr,
  };
}

/**
 * Добавить дни к дате
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Добавить месяцы к дате
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
