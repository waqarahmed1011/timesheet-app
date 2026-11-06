import Link from "next/link";
import { requireActor } from "@/server/actor";
import { db } from "@/lib/db";
import { addDays, currentWeekStart, dueAt, toDate, toIso, weekLabel } from "@/lib/week";
import { formatHours } from "@/lib/timesheet/hours";
import { Card, Flag, LinkButton, PageTitle, StatusBadge } from "@/components/ui";
import type { Status } from "@/lib/timesheet/state";

export default async function Home() {
  const me = await requireActor();
  const thisWeek = currentWeekStart();
  const lastWeek = addDays(thisWeek, -7);

  if (!me.workerId) {
    return (
      <div>
        <PageTitle>Hi {me.name}</PageTitle>
        <div className="flex flex-wrap gap-2">
          {(me.roles.includes("PM") || me.roles.includes("GC")) && <LinkButton href="/approvals">Approvals</LinkButton>}
          {(me.roles.includes("ADMIN") || me.roles.includes("GC")) && <LinkButton href="/admin" variant="secondary">Dashboard</LinkButton>}
          {me.roles.includes("FOREMAN") && <LinkButton href="/crew" variant="secondary">Crew timesheets</LinkButton>}
        </div>
      </div>
    );
  }

  const sheets = await db.timesheet.findMany({
    where: { workerId: me.workerId },
    orderBy: { weekStart: "desc" },
    take: 26,
    include: { approvals: { where: { action: "REJECT" }, orderBy: { createdAt: "desc" }, take: 1, include: { approver: true } } },
  });
  const byWeek = new Map(sheets.map((s) => [toIso(s.weekStart), s]));
  const now = new Date();

  const weekCard = (ws: string, title: string) => {
    const s = byWeek.get(ws);
    const status = (s?.status ?? "DRAFT") as Status;
    const needsAction = !s || status === "DRAFT" || status === "REJECTED";
    return (
      <Card key={ws}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm text-stone-600">{title}</div>
            <div className="font-semibold">{weekLabel(ws)}</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {s ? <StatusBadge status={status} /> : <StatusBadge status="MISSING" />}
              {s && <span className="text-sm">{formatHours(s.totalMinutes)}h</span>}
              {needsAction && now > dueAt(ws) && <Flag tone="red">Past due</Flag>}
            </div>
            {status === "REJECTED" && s?.approvals[0] && (
              <p className="mt-1 text-sm text-red-700">Sent back: {s.approvals[0].comment}</p>
            )}
          </div>
          <LinkButton href={`/sheet/${me.workerId}/${ws}`} variant={needsAction ? "primary" : "secondary"}>
            {needsAction ? (s ? "Continue" : "Fill out") : "View"}
          </LinkButton>
        </div>
      </Card>
    );
  };

  const history = sheets.filter((s) => toIso(s.weekStart) < lastWeek);

  return (
    <div className="space-y-4">
      <PageTitle sub="Weeks run Sunday to Saturday. Due Monday 10:00 AM.">My timesheets</PageTitle>
      {weekCard(lastWeek, "Last week")}
      {weekCard(thisWeek, "This week")}
      <Card>
        <h2 className="mb-2 font-semibold">History</h2>
        {history.length === 0 && <p className="text-sm text-stone-500">No earlier weeks yet.</p>}
        <ul className="divide-y divide-stone-100">
          {history.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <Link className="underline" href={`/sheet/${me.workerId}/${toIso(s.weekStart)}`}>{weekLabel(toIso(s.weekStart))}</Link>
              <span className="flex items-center gap-2">{formatHours(s.totalMinutes)}h <StatusBadge status={s.status as Status} /></span>
            </li>
          ))}
        </ul>
        <form action="/go" className="mt-3 flex items-center gap-2 text-sm">
          <span>Other week:</span>
          <input type="date" name="d" className="rounded border border-stone-300 px-2 py-1" defaultValue={toIso(toDate(thisWeek))} />
          <input type="hidden" name="w" value={me.workerId} />
          <button className="underline">Open</button>
        </form>
      </Card>
    </div>
  );
}
