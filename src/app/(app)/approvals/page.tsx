import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/actor";
import { db } from "@/lib/db";
import { toIso, weekLabel } from "@/lib/week";
import { formatHours } from "@/lib/timesheet/hours";
import { Card, Flag, PageTitle, StatusBadge } from "@/components/ui";
import type { Status } from "@/lib/timesheet/state";

export default async function ApprovalsPage() {
  const me = await requireActor();
  const isGc = me.roles.includes("GC");
  if (!isGc && !me.roles.includes("PM")) redirect("/");

  const sheets = await db.timesheet.findMany({
    where: { status: { in: ["SUBMITTED", "PM_APPROVED"] } },
    include: {
      worker: { include: { company: true } },
      days: { include: { entries: { include: { project: true } } } },
      approvals: true,
    },
    orderBy: [{ weekStart: "asc" }, { submittedAt: "asc" }],
  });

  const rows = sheets
    .map((s) => {
      const projectIds = [...new Set(s.days.flatMap((d) => d.entries.map((e) => e.projectId)))];
      const projects = [...new Map(s.days.flatMap((d) => d.entries.map((e) => [e.projectId, e.project] as const))).values()];
      const approved = s.approvals.filter((a) => a.cycle === s.cycle && a.step === "PM" && a.action === "APPROVE").map((a) => a.projectId);
      const myPending = s.status === "SUBMITTED" && projectIds.some((p) => me.pmProjectIds.includes(p) && !approved.includes(p));
      const waitingOnMe = myPending || (isGc && s.status === "PM_APPROVED");
      const visible = isGc || projectIds.some((p) => me.pmProjectIds.includes(p));
      const wasEdited = s.approvals.some((a) => a.action === "EDIT");
      const missingDays = s.days.filter((d) => d.paidMinutes > 0).length;
      return { s, projects, waitingOnMe, visible, wasEdited, missingDays };
    })
    .filter((r) => r.visible);

  const mine = rows.filter((r) => r.waitingOnMe);
  const others = rows.filter((r) => !r.waitingOnMe);

  const list = (items: typeof rows) => (
    <ul className="divide-y divide-stone-100">
      {items.map(({ s, projects, wasEdited, missingDays }) => (
        <li key={s.id}>
          <Link href={`/sheet/${s.workerId}/${toIso(s.weekStart)}`} className="block p-3 hover:bg-stone-50" data-testid="approval-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{s.worker.name} <span className="text-xs text-stone-500">{s.worker.company.name}</span></div>
                <div className="text-xs text-stone-600">Week {weekLabel(toIso(s.weekStart))} · {projects.map((p) => p.number).join(", ")}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{formatHours(s.totalMinutes)}h</span>
                <StatusBadge status={s.status as Status} />
                {s.totalMinutes > 2400 && <Flag>Over 40</Flag>}
                {s.isLate && <Flag tone="red">Late</Flag>}
                {wasEdited && <Flag tone="sky">Edited</Flag>}
                {missingDays < 5 && <Flag>{missingDays} days worked</Flag>}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <PageTitle sub="Oldest first. Check the flags before approving.">Approvals</PageTitle>
      <Card className="p-0">
        <h2 className="border-b border-stone-100 p-3 font-semibold">Waiting on you ({mine.length})</h2>
        {mine.length ? list(mine) : <p className="p-3 text-sm text-stone-500">Nothing waiting on you.</p>}
      </Card>
      {others.length > 0 && (
        <Card className="p-0">
          <h2 className="border-b border-stone-100 p-3 font-semibold">In review elsewhere ({others.length})</h2>
          {list(others)}
        </Card>
      )}
    </div>
  );
}
