import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, toDate, toIso } from "@/lib/week";

export type HoursRow = { projectNumber: string; projectName: string; phase: string; minutes: number };

/** Hours on submitted-or-later sheets (not drafts, not void) between two week starts, inclusive. */
export async function hoursByProjectPhase(fromWeek: string | null, toWeek: string): Promise<HoursRow[]> {
  const from = fromWeek ? Prisma.sql`AND t."weekStart" >= ${toDate(fromWeek)}` : Prisma.empty;
  const rows = await db.$queryRaw<{ number: string; name: string; phase: string; minutes: bigint }[]>`
    SELECT p.number, p.name, ph.name AS phase, SUM(e.minutes) AS minutes
    FROM "TimesheetEntry" e
    JOIN "TimesheetDay" d ON d.id = e."dayId"
    JOIN "Timesheet" t ON t.id = d."timesheetId"
    JOIN "Project" p ON p.id = e."projectId"
    JOIN "Phase" ph ON ph.id = e."phaseId"
    WHERE t.status NOT IN ('DRAFT', 'VOID') AND t."weekStart" <= ${toDate(toWeek)} ${from}
    GROUP BY p.number, p.name, ph.name
    ORDER BY p.number, ph.name`;
  return rows.map((r) => ({ projectNumber: r.number, projectName: r.name, phase: r.phase, minutes: Number(r.minutes) }));
}

export async function weekStatus(weekStart: string) {
  const [workers, sheets] = await Promise.all([
    db.worker.findMany({ where: { active: true }, include: { company: true }, orderBy: { name: "asc" } }),
    db.timesheet.findMany({
      where: { weekStart: toDate(weekStart), status: { not: "VOID" } },
      include: { worker: { include: { company: true } }, days: { include: { entries: true } }, approvals: true },
    }),
  ]);
  const byWorker = new Map(sheets.map((s) => [s.workerId, s]));
  const submitted = sheets.filter((s) => !["DRAFT", "REJECTED"].includes(s.status));
  return {
    expected: workers.length,
    submitted: submitted.length,
    pmApproved: sheets.filter((s) => s.status === "PM_APPROVED" || s.status === "LOCKED").length,
    gcApproved: sheets.filter((s) => s.status === "LOCKED").length,
    missing: workers
      .filter((w) => { const s = byWorker.get(w.id); return !s || s.status === "DRAFT" || s.status === "REJECTED"; })
      .map((w) => ({ worker: w, status: byWorker.get(w.id)?.status ?? null })),
    late: sheets.filter((s) => s.isLate),
    over40: sheets.filter((s) => s.totalMinutes > 2400).sort((a, b) => b.totalMinutes - a.totalMinutes),
    sheets,
  };
}

/** Who each in-review sheet is waiting on. */
export async function pendingByApprover() {
  const sheets = await db.timesheet.findMany({
    where: { status: { in: ["SUBMITTED", "PM_APPROVED"] } },
    include: { days: { include: { entries: { include: { project: { include: { pm: true } } } } } }, approvals: true },
  });
  const gcUsers = await db.user.findMany({ where: { roles: { has: "GC" }, active: true } });
  const out = new Map<string, { name: string; count: number; oldest: Date | null }>();
  const bump = (key: string, name: string, at: Date | null) => {
    const r = out.get(key) ?? { name, count: 0, oldest: null };
    r.count++;
    if (at && (!r.oldest || at < r.oldest)) r.oldest = at;
    out.set(key, r);
  };
  for (const s of sheets) {
    if (s.status === "PM_APPROVED") {
      for (const g of gcUsers) bump(g.id, `${g.name} (GC)`, s.submittedAt);
      continue;
    }
    const approved = new Set(s.approvals.filter((a) => a.cycle === s.cycle && a.step === "PM" && a.action === "APPROVE").map((a) => a.projectId));
    const projects = new Map(s.days.flatMap((d) => d.entries.map((e) => [e.projectId, e.project] as const)));
    for (const [pid, p] of projects) {
      if (approved.has(pid)) continue;
      if (p.pm) bump(p.pm.id, `${p.pm.name} (PM, ${p.number})`, s.submittedAt);
      else bump(`nopm-${pid}`, `No PM assigned: ${p.number}`, s.submittedAt);
    }
  }
  return [...out.values()].sort((a, b) => (a.oldest?.getTime() ?? 0) - (b.oldest?.getTime() ?? 0));
}

export const fourWeeksBack = (weekStart: string) => addDays(weekStart, -21);
export { toIso };
