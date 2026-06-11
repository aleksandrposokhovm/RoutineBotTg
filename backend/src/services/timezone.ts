/**
 * Сервис для работы с часовыми поясами
 * Гибридный метод: голосовое управление + подстраховка через Mini App
 */

/**
 * Получить текущую дату и время в часовом поясе пользователя
 */
export function getCurrentDatetimeInTz(timezone: string): string {
  return new Date().toLocaleString('ru-RU', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long'
  });
}

/**
 * Получить текущую дату (YYYY-MM-DD) в часовом поясе пользователя
 */
export function getTodayDateInTz(timezone: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Преобразовать локальное время (HH:MM) в конкретном часовом поясе в UTC Date
 */
export function localTimeToUTC(date: string, time: string, timezone: string): Date {
  const utcDate = new Date(`${date}T${time}:00Z`);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(utcDate);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);
  
  const year = getPart('year');
  const month = getPart('month') - 1;
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');

  const formattedTzDate = Date.UTC(year, month, day, hour, minute);
  const diff = formattedTzDate - utcDate.getTime();
  
  return new Date(utcDate.getTime() - diff);
}

/**
 * Преобразовать UTC Date в локальное время (HH:MM) для указанного часового пояса
 */
export function utcToLocalTime(utcDate: Date, timezone: string): string {
  return utcDate.toLocaleTimeString('ru-RU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Преобразовать UTC Date в локальную дату (YYYY-MM-DD) для указанного часового пояса
 */
export function utcToLocalDate(utcDate: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(utcDate);

  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Получить текущий час в часовом поясе пользователя
 */
export function getCurrentHourInTz(timezone: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(now);
  return parseInt(parts.find(p => p.type === 'hour')!.value, 10);
}

/**
 * Валидация IANA timezone строки
 */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Сдвинуть дату на указанное количество дней (для YYYY-MM-DD строк, независимо от часового пояса системы)
 */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}
