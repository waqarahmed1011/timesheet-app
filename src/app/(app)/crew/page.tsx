import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { db } from "@/lib/db";
import { addDays, currentWeekStart, dueAt, isWeekStart, toDate, weekLabel } from "@/lib/week";
import { formatHours } from "@/lib/timesheet/hours";
import { Card, Flag, PageTitle, StatusBadge } from "@/components/ui";
import type { Status } from "@/lib/timesheet/state";

export default async function CrewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await requireActor();
  const isAdmin = me.roles.includes("ADMIN");
  if (!me.roles.includes("FOREMAN") && !isAdmin) redirect("/");
  const sp = await searchParams;
  const week = sp.week && isWeekStart(sp.week) ? sp.week : addDays(currentWeekStart(), -7);

  const workers = await db.worker.findMany({
    where: { active: true, ...(isAdmin ? {} : { companyId: me.companyId ?? "__none__" }) },
    include: { company: true, timesheets: { where: { weekStart: toDate(week) } } },
    orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
  });
  const pastDue = new Date() > dueAt(week);

  return (
    <div className="space-y-4">
      <PageTitle sub="Fill out and sign timesheets for workers in your crew, including those without a login.">Crew timesheets</PageTitle>
      <div className="flex items-center gap-3 text-sm">
        <Link className="underline" href={`/crew?week=${addDays(week, -7)}`}>← Prev</Link>
        <strong>Week {weekLabel(week)}</strong>
        <Link className="underline" href={`/crew?week=${addDays(week, 7)}`}>Next →</Link>
      </div>
      <Card className="p-0">
        <ul className="divide-y divide-stone-100">
          {workers.map((w) => {
            const s = w.timesheets[0];
            return (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <div className="font-medium">{w.name}</div>
                  <div className="text-xs text-stone-500">{w.company.name}{w.userId ? "" : " · no login"}</div>
                </div>
                <div className="flex items-center gap-2">
                  {s ? <><span className="text-sm">{formatHours(s.totalMinutes)}h</span><StatusBadge status={s.status as Status} /></> : <StatusBadge status="MISSING" />}
                  {s?.isLate && <Flag tone="red">Late</Flag>}
                  {!s && pastDue && <Flag tone="red">Past due</Flag>}
                  <Link className="rounded border border-stone-300 px-3 py-1 text-sm font-medium" href={`/sheet/${w.id}/${week}`}>Open</Link>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
