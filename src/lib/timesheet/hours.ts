// Hours rules for a timesheet. Everything is in whole minutes.

export const STEP = 15; // quarter hour
export const LUNCH_MINUTES = 30;
export const LUNCH_THRESHOLD = 7.5 * 60; // auto-deduct lunch when the day spans 7.5h or more
export const WEEKLY_OT_THRESHOLD = 40 * 60;

export type EntryInput = { projectId: string; phaseId: string; minutes: number };
export type DayInput = {
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  noLunch: boolean;
  entries: EntryInput[];
};

export type DayResult = {
  date: string;
  lunchMinutes: number;
  paidMinutes: number;
  errors: string[];
};

export function isQuarter(m: number): boolean {
  return Number.isInteger(m) && m % STEP === 0;
}

export function computeDay(day: DayInput): DayResult {
  const errors: string[] = [];
  const { startMinute: s, endMinute: e } = day;
  const entryTotal = day.entries.reduce((t, x) => t + x.minutes, 0);

  for (const x of day.entries) {
    if (!x.projectId || !x.phaseId) errors.push("Each row needs a project and a phase");
    if (!isQuarter(x.minutes) || x.minutes < 0) errors.push("Hours must be in quarter-hour steps");
  }

  if (s == null && e == null) {
    if (entryTotal > 0) errors.push("Enter a start and end time for days with hours");
    return { date: day.date, lunchMinutes: 0, paidMinutes: 0, errors };
  }
  if (s == null || e == null) {
    errors.push("Enter both a start and end time");
    return { date: day.date, lunchMinutes: 0, paidMinutes: 0, errors };
  }
  if (!isQuarter(s) || !isQuarter(e) || s < 0 || e > 24 * 60) {
    errors.push("Times must be on the quarter hour");
  }
  if (e <= s) {
    errors.push("End time must be after start time");
    return { date: day.date, lunchMinutes: 0, paidMinutes: 0, errors };
  }

  const span = e - s;
  const lunchMinutes = !day.noLunch && span >= LUNCH_THRESHOLD ? LUNCH_MINUTES : 0;
  const paidMinutes = span - lunchMinutes;

  if (entryTotal !== paidMinutes) {
    errors.push(
      `Project hours (${formatHours(entryTotal)}) must add up to paid hours for the day (${formatHours(paidMinutes)})`,
    );
  }
  return { date: day.date, lunchMinutes, paidMinutes, errors };
}

export function computeSheet(days: DayInput[]) {
  const results = days.map(computeDay);
  const totalMinutes = results.reduce((t, d) => t + d.paidMinutes, 0);
  const errors = results.flatMap((d) => d.errors.map((msg) => `${d.date}: ${msg}`));
  return {
    days: results,
    totalMinutes,
    overtimeMinutes: Math.max(0, totalMinutes - WEEKLY_OT_THRESHOLD),
    over40: totalMinutes > WEEKLY_OT_THRESHOLD,
    errors,
    valid: errors.length === 0,
  };
}

export function formatHours(minutes: number): string {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, "");
}

export function hoursToMinutes(input: string | number): number | null {
  const n = typeof input === "number" ? input : Number(String(input).trim() || "0");
  if (!Number.isFinite(n) || n < 0) return null;
  const m = Math.round(n * 60);
  return Math.abs(n * 60 - m) < 1e-6 ? m : null;
}

/** "07:30" -> 450 */
export function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** 450 -> "07:30" */
export function formatTime(m: number | null | undefined): string {
  if (m == null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 450 -> "7:30 AM" */
export function formatTime12(m: number | null | undefined): string {
  if (m == null) return "";
  const h = Math.floor(m / 60) % 24;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${suffix}`;
}
