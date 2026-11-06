import Link from "next/link";
import { requireRole } from "@/server/actor";
import { addDays, currentWeekStart, isWeekStart, toIso, weekLabel } from "@/lib/week";
import { formatHours } from "@/lib/timesheet/hours";
import { fourWeeksBack, hoursByProjectPhase, pendingByApprover, weekStatus } from "@/server/dashboard";
import { Card, Flag, PageTitle, StatusBadge } from "@/components/ui";
import { HoursTable } from "@/components/HoursTable";
import type { Status } from "@/lib/timesheet/state";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole("ADMIN", "GC");
  const sp = await searchParams;
  const week = sp.week && isWeekStart(sp.week) ? sp.week : addDays(currentWeekStart(), -7);
  const [st, pending, thisWeek, last4, toDate] = await Promise.all([
    weekStatus(week),
    pendingByApprover(),
    hoursByProjectPhase(week, week),
    hoursByProjectPhase(fourWeeksBack(week), week),
    hoursByProjectPhase(null, week),
  ]);

  const tiles: [string, number][] = [
    ["Expected", st.expected],
    ["Submitted", st.submitted],
    ["PM approved", st.pmApproved],
    ["GC approved", st.gcApproved],
  ];

  return (
    <div className="space-y-4">
      <PageTitle sub="Hours count once a sheet is submitted. Only GC-approved (locked) sheets are final for payroll.">Dashboard</PageTitle>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link className="underline" href={`/admin?week=${addDays(week, -7)}`}>← Prev</Link>
        <strong>Week {weekLabel(week)}</strong>
        <Link className="underline" href={`/admin?week=${addDays(week, 7)}`}>Next →</Link>
        <span className="ml-auto flex gap-3">
          <a className="underline" href={`/api/export/week/${week}`}>Download Excel</a>
          <a className="underline" href={`/api/export/week/${week}?format=zip`}>Download all PDFs + Excel</a>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, n]) => (
          <Card key={label}><div className="text-xs text-stone-600">{label}</div><div className="text-2xl font-bold" data-testid={`tile-${label}`}>{n}</div></Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Missing or not submitted ({st.missing.length})</h2>
          {st.missing.length === 0 ? <p className="text-sm text-stone-500">Everyone has submitted.</p> : (
            <ul className="space-y-1 text-sm">
              {st.missing.map(({ worker, status }) => (
                <li key={worker.id} className="flex justify-between gap-2">
                  <Link className="underline" href={`/sheet/${worker.id}/${week}`}>{worker.name}</Link>
                  <span className="flex items-center gap-2 text-xs text-stone-500">{worker.company.name} {status ? <StatusBadge status={status as Status} /> : <StatusBadge status="MISSING" />}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Waiting on approvers</h2>
          {pending.length === 0 ? <p className="text-sm text-stone-500">Nothing in review.</p> : (
            <ul className="space-y-1 text-sm">
              {pending.map((p) => (
                <li key={p.name} className="flex justify-between gap-2">
                  <span>{p.name}</span>
                  <span className="text-stone-600">{p.count} sheet{p.count === 1 ? "" : "s"}{p.oldest && `, oldest ${p.oldest.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Overtime watch (over 40)</h2>
          {st.over40.length === 0 ? <p className="text-sm text-stone-500">No one over 40 this week.</p> : (
            <ul className="space-y-1 text-sm">
              {st.over40.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <Link className="underline" href={`/sheet/${s.workerId}/${week}`}>{s.worker.name}</Link>
                  <span>{formatHours(s.totalMinutes)}h <Flag>{formatHours(s.totalMinutes - 2400)} OT</Flag></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold">Late submissions ({st.late.length})</h2>
          {st.late.length === 0 ? <p className="text-sm text-stone-500">None.</p> : (
            <ul className="space-y-1 text-sm">
              {st.late.map((s) => (
                <li key={s.id} className="flex justify-between">
                  <Link className="underline" href={`/sheet/${s.workerId}/${toIso(s.weekStart)}`}>{s.worker.name}</Link>
                  <span className="text-stone-600">{s.submittedAt?.toLocaleString("en-US", { timeZone: "America/Chicago" })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><h2 className="mb-1 font-semibold">Hours this week</h2><HoursTable rows={thisWeek} /></Card>
        <Card><h2 className="mb-1 font-semibold">Last 4 weeks</h2><HoursTable rows={last4} /></Card>
        <Card><h2 className="mb-1 font-semibold">Project to date</h2><HoursTable rows={toDate} /></Card>
      </div>
    </div>
  );
}
