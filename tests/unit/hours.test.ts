import { describe, expect, it } from "vitest";
import { computeDay, computeSheet, formatHours, hoursToMinutes, parseTime, type DayInput } from "@/lib/timesheet/hours";

const day = (start: string | null, end: string | null, noLunch: boolean, entries: [string, string, number][]): DayInput => ({
  date: "2026-11-02",
  startMinute: parseTime(start),
  endMinute: parseTime(end),
  noLunch,
  entries: entries.map(([projectId, phaseId, h]) => ({ projectId, phaseId, minutes: Math.round(h * 60) })),
});

describe("lunch deduction", () => {
  it("does not deduct lunch on a day just under 7.5h", () => {
    const r = computeDay(day("07:00", "14:15", false, [["p1", "f1", 7.25]]));
    expect(r.lunchMinutes).toBe(0);
    expect(r.paidMinutes).toBe(435);
    expect(r.errors).toEqual([]);
  });

  it("deducts 30 minutes at exactly 7.5h", () => {
    const r = computeDay(day("07:00", "14:30", false, [["p1", "f1", 7]]));
    expect(r.lunchMinutes).toBe(30);
    expect(r.paidMinutes).toBe(420);
    expect(r.errors).toEqual([]);
  });

  it("does not deduct when the worker checks no lunch taken", () => {
    const r = computeDay(day("07:00", "15:30", true, [["p1", "f1", 8.5]]));
    expect(r.lunchMinutes).toBe(0);
    expect(r.paidMinutes).toBe(510);
    expect(r.errors).toEqual([]);
  });
});

describe("validation", () => {
  it("rejects times off the quarter hour", () => {
    expect(computeDay(day("07:10", "15:30", false, [["p1", "f1", 7.83]])).errors.join()).toMatch(/quarter/);
  });

  it("rejects hours off the quarter hour", () => {
    const d = day("07:00", "15:30", false, [["p1", "f1", 8]]);
    d.entries[0].minutes = 470;
    expect(computeDay(d).errors.join()).toMatch(/quarter-hour/);
  });

  it("rejects rows that don't add up to the day's paid hours", () => {
    const r = computeDay(day("07:00", "15:30", false, [["p1", "f1", 4], ["p2", "f2", 3]]));
    expect(r.paidMinutes).toBe(480);
    expect(r.errors.join()).toMatch(/must add up/);
  });

  it("accepts a day split across two projects", () => {
    const r = computeDay(day("07:00", "15:30", false, [["p1", "f1", 4], ["p2", "f2", 4]]));
    expect(r.errors).toEqual([]);
  });

  it("requires start/end when hours are entered", () => {
    expect(computeDay(day(null, null, false, [["p1", "f1", 8]])).errors.join()).toMatch(/start and end/);
  });

  it("rejects end before start", () => {
    expect(computeDay(day("15:00", "07:00", false, [])).errors.join()).toMatch(/after start/);
  });

  it("allows an empty day", () => {
    expect(computeDay(day(null, null, false, [])).errors).toEqual([]);
  });

  it("requires a project and phase on each row", () => {
    expect(computeDay(day("07:00", "11:00", false, [["", "f1", 4]])).errors.join()).toMatch(/project and a phase/);
  });
});

describe("weekly totals", () => {
  it("flags over 40 hours", () => {
    const days = Array.from({ length: 5 }, () => day("06:00", "15:30", false, [["p1", "f1", 9]]));
    const r = computeSheet(days);
    expect(r.totalMinutes).toBe(45 * 60);
    expect(r.over40).toBe(true);
    expect(r.overtimeMinutes).toBe(5 * 60);
  });

  it("exactly 40 is not overtime", () => {
    const days = Array.from({ length: 5 }, () => day("07:00", "15:30", false, [["p1", "f1", 8]]));
    expect(computeSheet(days).over40).toBe(false);
  });
});

describe("formatting", () => {
  it("formats and parses hours", () => {
    expect(formatHours(495)).toBe("8.25");
    expect(formatHours(510)).toBe("8.5");
    expect(formatHours(480)).toBe("8");
    expect(hoursToMinutes("8.25")).toBe(495);
    expect(hoursToMinutes("8.333")).toBe(null);
    expect(hoursToMinutes("-1")).toBe(null);
  });
});
