import { fromZonedTime } from "date-fns-tz";

// All work dates are plain calendar dates ("YYYY-MM-DD"). We do date math in UTC
// so DST changes never shift a day.
export const TIME_ZONE = "America/Chicago";
export const DUE_DAY_OFFSET = 8; // Monday after the Sunday-Saturday week
export const DUE_TIME = "10:00:00";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toDate(s: string): Date {
  if (!isIsoDate(s)) throw new Error(`Invalid date: ${s}`);
  return new Date(`${s}T00:00:00Z`);
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, n: number): string {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(s: string): number {
  return toDate(s).getUTCDay();
}

export function weekStartOf(s: string): string {
  return addDays(s, -dayOfWeek(s));
}

export function isWeekStart(s: string): boolean {
  return isIsoDate(s) && dayOfWeek(s) === 0;
}

export function weekDays(weekStart: string): string[] {
  if (!isWeekStart(weekStart)) throw new Error(`${weekStart} is not a Sunday`);
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** Today's date as seen in Chicago. */
export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayLocal(now));
}

/** Monday 10:00 Chicago time after the week ends. */
export function dueAt(weekStart: string): Date {
  const monday = addDays(weekStart, DUE_DAY_OFFSET);
  return fromZonedTime(`${monday}T${DUE_TIME}`, TIME_ZONE);
}

export function isLate(weekStart: string, submittedAt: Date): boolean {
  return submittedAt.getTime() > dueAt(weekStart).getTime();
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayName(s: string): string {
  return DAY_NAMES[dayOfWeek(s)];
}

/** "11/2" style short label */
export function shortDate(s: string): string {
  const [, m, d] = s.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function weekLabel(weekStart: string): string {
  const end = weekEnd(weekStart);
  return `${shortDate(weekStart)}/${weekStart.slice(0, 4)} - ${shortDate(end)}/${end.slice(0, 4)}`;
}
