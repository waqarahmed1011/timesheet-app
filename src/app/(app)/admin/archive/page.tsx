import Link from "next/link";
import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { isWeekStart, toDate, toIso, weekLabel } from "@/lib/week";
import { formatHours } from "@/lib/timesheet/hours";
import { Card, PageTitle, StatusBadge } from "@/components/ui";
import type { Status } from "@/lib/timesheet/state";

export default async function Archive({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireRole("ADMIN", "GC");
  const sp = await searchParams;
  const weeks = await db.timesheet.groupBy({ by: ["weekStart", "status"], _count: true, _sum: { totalMinutes: true }, orderBy: { weekStart: "desc" } });
  const byWeek = new Map<string, { counts: Partial<Record<Status, number>>; minutes: number }>();
  for (const w of weeks) {
    const k = toIso(w.weekStart);
    const e = byWeek.get(k) ?? { counts: {}, minutes: 0 };
    e.counts[w.status as Status] = w._count;
    if (w.status !== "VOID") e.minutes += w._sum.totalMinutes ?? 0;
    byWeek.set(k, e);
  }
  const selected = sp.week && isWeekStart(sp.week) ? sp.week : null;
  const sheets = selected
    ? await db.timesheet.findMany({ where: { weekStart: toDate(selected) }, include: { worker: { include: { company: true } } }, orderBy: { worker: { name: "asc" } } })
    : [];
  const exports = await db.exportFile.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, filename: true, kind: true, createdAt: true, checksum: true, createdBy: { select: { name: true } } } });

  return (
    <div className="space-y-4">
      <PageTitle sub="Every week is kept permanently. Download any week as Excel, or all PDFs plus Excel in one zip.">Archive</PageTitle>

      {selected && (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Week {weekLabel(selected)}</h2>
            <span className="flex gap-3 text-sm">
              <a className="underline" href={`/api/export/week/${selected}`}>Excel</a>
              <a className="underline" href={`/api/export/week/${selected}?format=zip`}>PDFs + Excel (zip)</a>
              <Link className="underline" href="/admin/archive">Close</Link>
            </span>
          </div>
          <ul className="divide-y divide-stone-100 text-sm">
            {sheets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="underline" href={`/sheet/${s.workerId}/${selected}`}>{s.worker.name}</Link>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-stone-500">{s.worker.company.name}</span>
                  {formatHours(s.totalMinutes)}h <StatusBadge status={s.status as Status} />
                  <a className="text-xs underline" href={`/api/export/sheet/${s.id}`}>PDF</a>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 text-left text-xs uppercase text-stone-600">
            <tr><th className="p-2">Week</th><th className="p-2">Sheets</th><th className="p-2 text-right">Hours</th><th className="p-2">Download</th></tr>
          </thead>
          <tbody>
            {[...byWeek].map(([w, e]) => (
              <tr key={w} className="border-t border-stone-100">
                <td className="p-2"><Link className="underline" href={`/admin/archive?week=${w}`}>{weekLabel(w)}</Link></td>
                <td className="p-2"><div className="flex flex-wrap gap-1">{Object.entries(e.counts).map(([st, n]) => <span key={st} className="flex items-center gap-1"><StatusBadge status={st as Status} />{n}</span>)}</div></td>
                <td className="p-2 text-right">{formatHours(e.minutes)}</td>
                <td className="p-2 whitespace-nowrap"><a className="underline" href={`/api/export/week/${w}`}>Excel</a> · <a className="underline" href={`/api/export/week/${w}?format=zip`}>Zip</a></td>
              </tr>
            ))}
            {byWeek.size === 0 && <tr><td className="p-2 text-stone-500" colSpan={4}>No timesheets yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Recent downloads</h2>
        <p className="mb-2 text-xs text-stone-500">Each file is stored exactly as generated, so you can pull the same copy you sent to payroll.</p>
        <ul className="space-y-1 text-sm">
          {exports.map((x) => (
            <li key={x.id} className="flex flex-wrap justify-between gap-2">
              <a className="underline" href={`/api/export/file/${x.id}`}>{x.filename}</a>
              <span className="text-xs text-stone-500">{x.createdBy.name} · {x.createdAt.toLocaleString("en-US", { timeZone: "America/Chicago" })} · sha256 {x.checksum.slice(0, 10)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
