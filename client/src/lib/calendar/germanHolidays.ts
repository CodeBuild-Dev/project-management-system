function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const yearCache = new Map<number, Map<string, string>>();

function buildYear(year: number): Map<string, string> {
  const easter = getEasterSunday(year);
  const map = new Map<string, string>();

  // Federal public holidays — non-working everywhere in Germany.
  map.set(dateKey(new Date(year, 0, 1)), 'Neujahr');
  map.set(dateKey(addDays(easter, -2)), 'Karfreitag');
  map.set(dateKey(addDays(easter, 1)), 'Ostermontag');
  map.set(dateKey(new Date(year, 4, 1)), 'Tag der Arbeit');
  map.set(dateKey(addDays(easter, 39)), 'Christi Himmelfahrt');
  map.set(dateKey(addDays(easter, 50)), 'Pfingstmontag');
  map.set(dateKey(new Date(year, 9, 3)), 'Tag der Deutschen Einheit');
  map.set(dateKey(new Date(year, 11, 25)), '1. Weihnachtstag');
  map.set(dateKey(new Date(year, 11, 26)), '2. Weihnachtstag');

  // Common observances — not federal holidays but widely recognized days off.
  map.set(dateKey(new Date(year, 11, 24)), 'Heiligabend');
  map.set(dateKey(new Date(year, 11, 31)), 'Silvester');

  return map;
}

export function getGermanHoliday(date: Date): string | null {
  const year = date.getFullYear();
  let map = yearCache.get(year);
  if (!map) {
    map = buildYear(year);
    yearCache.set(year, map);
  }
  return map.get(dateKey(date)) ?? null;
}
