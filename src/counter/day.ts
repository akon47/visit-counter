const formatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar day (YYYY-MM-DD) of `date` in the given IANA time zone. */
export function dayKey(date: Date, timeZone: string): string {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // en-CA renders dates as YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Day key of the instant `days` days before `date` (used as the retention cutoff). */
export function dayKeyDaysAgo(date: Date, days: number, timeZone: string): string {
  return dayKey(new Date(date.getTime() - days * DAY_MS), timeZone);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: string): boolean {
  return DAY_KEY.test(value);
}
