import { describe, expect, it } from "vitest";
import { addDays, dueAt, isLate, isWeekStart, todayLocal, weekDays, weekStartOf } from "@/lib/week";

describe("week math (Sunday to Saturday)", () => {
  it("finds the Sunday for any day of the week", () => {
    expect(weekStartOf("2026-11-01")).toBe("2026-11-01"); // Sunday
    expect(weekStartOf("2026-11-04")).toBe("2026-11-01"); // Wednesday
    expect(weekStartOf("2026-11-07")).toBe("2026-11-01"); // Saturday
    expect(weekStartOf("2026-11-08")).toBe("2026-11-08"); // next Sunday
  });

  it("returns 7 days Sunday through Saturday", () => {
    expect(weekDays("2026-11-01")).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    ]);
  });

  it("rejects a week start that isn't a Sunday", () => {
    expect(isWeekStart("2026-11-02")).toBe(false);
    expect(() => weekDays("2026-11-02")).toThrow();
  });

  it("handles DST weeks without losing or repeating a day", () => {
    // DST starts 2026-03-08, ends 2026-11-01 in the US
    expect(weekDays("2026-03-08")).toHaveLength(7);
    expect(weekDays("2026-03-08")[6]).toBe("2026-03-14");
    expect(weekDays("2026-11-01")[6]).toBe("2026-11-07");
  });

  it("handles year rollover", () => {
    expect(weekStartOf("2027-01-01")).toBe("2026-12-27");
    expect(weekDays("2026-12-27")[6]).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); // leap year
  });

  it("uses Chicago time for today", () => {
    // 2026-11-07 03:00 UTC is still 11/6 9pm in Chicago
    expect(todayLocal(new Date("2026-11-07T03:00:00Z"))).toBe("2026-11-06");
  });
});

describe("due time: Monday 10:00 Chicago after the week", () => {
  it("is Monday 10am central", () => {
    // week 11/1-11/7, due Mon 11/9 10:00 CST = 16:00 UTC
    expect(dueAt("2026-11-01").toISOString()).toBe("2026-11-09T16:00:00.000Z");
    // summer week (CDT, UTC-5): week 7/5-7/11, due Mon 7/13 15:00 UTC
    expect(dueAt("2026-07-05").toISOString()).toBe("2026-07-13T15:00:00.000Z");
  });

  it("flags late after 10:00, not at 9:59", () => {
    expect(isLate("2026-11-01", new Date("2026-11-09T15:59:00Z"))).toBe(false);
    expect(isLate("2026-11-01", new Date("2026-11-09T16:00:00Z"))).toBe(false);
    expect(isLate("2026-11-01", new Date("2026-11-09T16:01:00Z"))).toBe(true);
  });
});
