/**
 * holidays.ts
 * Automatically computes company holidays for any given year.
 *
 * Observed holidays:
 *   - New Year's Day          (Jan 1)
 *   - Good Friday             (Friday before Easter)
 *   - Memorial Day            (last Monday of May)
 *   - Independence Day        (Jul 4)
 *   - Labor Day               (first Monday of September)
 *   - Thanksgiving Day        (fourth Thursday of November)
 *   - Day after Thanksgiving  (Friday after Thanksgiving)
 *   - Christmas Eve           (Dec 24)
 *   - Christmas Day           (Dec 25)
 *
 * Observance rule (applied to fixed-date holidays only):
 *   - Falls on Saturday → observed the Friday before
 *   - Falls on Sunday   → observed the Monday after
 *
 * Good Friday, Memorial Day, Labor Day, and Thanksgiving (+ day after)
 * are already weekday-anchored by definition and need no shift.
 */

export interface Holiday {
  date: string; // 'YYYY-MM-DD'
  name: string;
}

// ── Date helpers ────────────────────────────────────────────────────────────

/** Zero-padded 'YYYY-MM-DD' from a Date object (local time). */
const toDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Applies the Saturday→Friday / Sunday→Monday observance shift
 * to a fixed calendar date (e.g. Jan 1, Jul 4, Dec 24/25).
 */
const observe = (d: Date): Date => {
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  if (dow === 6) {
    // Saturday → Friday
    const fri = new Date(d);
    fri.setDate(fri.getDate() - 1);
    return fri;
  }
  if (dow === 0) {
    // Sunday → Monday
    const mon = new Date(d);
    mon.setDate(mon.getDate() + 1);
    return mon;
  }
  return d;
};

// ── Algorithm: Easter (Anonymous Gregorian) ─────────────────────────────────

const easterDate = (year: number): Date => {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
};

/** Good Friday = 2 days before Easter. */
const goodFriday = (year: number): Date => {
  const easter = easterDate(year);
  const gf = new Date(easter);
  gf.setDate(gf.getDate() - 2);
  return gf;
};

// ── Algorithm: nth weekday of a month ───────────────────────────────────────

/**
 * Returns the nth occurrence of `weekday` (0=Sun … 6=Sat) in `month` (0-based).
 * Use n = -1 for the *last* occurrence.
 */
const nthWeekday = (year: number, month: number, weekday: number, n: number): Date => {
  if (n === -1) {
    // Last occurrence: start from the last day and go backwards
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - weekday + 7) % 7;
    lastDay.setDate(lastDay.getDate() - diff);
    return lastDay;
  }
  // nth occurrence (1-based)
  const first = new Date(year, month, 1);
  const diff = (weekday - first.getDay() + 7) % 7;
  first.setDate(1 + diff + (n - 1) * 7);
  return first;
};

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Returns all company holidays for the given year as an array of
 * { date: 'YYYY-MM-DD', name: string } objects, sorted by date.
 */
export const getHolidaysForYear = (year: number): Holiday[] => {
  const holidays: Holiday[] = [];

  const add = (d: Date, name: string) =>
    holidays.push({ date: toDateString(d), name });

  // Fixed-date holidays (with observance shift)
  add(observe(new Date(year, 0, 1)),   "New Year's Day");
  add(observe(new Date(year, 6, 4)),   'Independence Day');
  add(observe(new Date(year, 11, 24)), 'Christmas Eve');
  add(observe(new Date(year, 11, 25)), 'Christmas Day');

  // Floating holidays (already land on a weekday by definition — no shift needed)
  add(goodFriday(year),                'Good Friday');
  add(nthWeekday(year, 4, 1, -1),      'Memorial Day');          // last Monday of May
  add(nthWeekday(year, 8, 1, 1),       'Labor Day');             // first Monday of September

  const thanksgiving = nthWeekday(year, 10, 4, 4);               // 4th Thursday of November
  add(thanksgiving,                    'Thanksgiving Day');
  const dayAfter = new Date(thanksgiving);
  dayAfter.setDate(dayAfter.getDate() + 1);
  add(dayAfter,                        'Day after Thanksgiving');

  // Sort by date and deduplicate (edge case: two observed dates landing on the same day)
  const seen = new Set<string>();
  return holidays
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter(h => {
      if (seen.has(h.date)) return false;
      seen.add(h.date);
      return true;
    });
};

/**
 * Returns the Holiday object if the given 'YYYY-MM-DD' date is a company
 * holiday, or undefined if it is not.
 */
export const getHoliday = (date: string): Holiday | undefined => {
  const year = Number(date.split('-')[0]);
  return getHolidaysForYear(year).find(h => h.date === date);
};

/**
 * Returns true if the given 'YYYY-MM-DD' date is a company holiday.
 */
export const isHoliday = (date: string): boolean => !!getHoliday(date);

/**
 * Returns today's date as a 'YYYY-MM-DD' string in local time.
 */
export const todayString = (): string => toDateString(new Date());
