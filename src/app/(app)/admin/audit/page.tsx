import Link from "next/link";
import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { AuditList } from "@/components/AuditList";
import { Card, PageTitle, input } from "@/components/ui";

const PAGE = 100;

export default async function Audit({ searchParams }: { searchParams: Promise<{ entity?: string; actor?: string; entityId?: string; page?: string }> }) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const where = {
    ...(sp.entity ? { entity: sp.entity } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.entityId ? { entityId: sp.entityId } : {}),
  };
  const [rows, users, sheets] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: "desc" }, take: PAGE + 1, skip: page * PAGE }),
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.timesheet.findMany({ select: { id: true, weekStart: true, worker: { select: { name: true } } } }),
  ]);
  const sheetLabel = new Map(sheets.map((s) => [s.id, `${s.worker.name}, week of ${s.weekStart.toISOString().slice(0, 10)}`]));
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp.entity ? { entity: sp.entity } : {}), ...(sp.actor ? { actor: sp.actor } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <PageTitle sub="Append-only record of every change, who made it, and why.">Audit log</PageTitle>
      <form className="flex flex-wrap gap-2">
        <select name="entity" defaultValue={sp.entity ?? ""} className={`${input} w-auto`}>
          <option value="">All records</option>
          {["Timesheet", "User", "Worker", "Project", "Phase", "Company"].map((e) => <option key={e}>{e}</option>)}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""} className={`${input} w-auto`}>
          <option value="">Anyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
        </select>
        <button className="rounded border border-stone-300 bg-white px-3">Filter</button>
      </form>
      <Card>
        <AuditList
          rows={rows.slice(0, PAGE).map((r) => ({
            ...r,
            actorName: r.actor?.name ?? r.actor?.email ?? null,
            label: r.entity === "Timesheet" ? `Timesheet: ${sheetLabel.get(r.entityId) ?? r.entityId}` : `${r.entity} ${r.entityId.slice(-6)}`,
          }))}
        />
      </Card>
      <div className="flex gap-3 text-sm">
        {page > 0 && <Link className="underline" href={qs(page - 1)}>← Newer</Link>}
        {rows.length > PAGE && <Link className="underline" href={qs(page + 1)}>Older →</Link>}
      </div>
    </div>
  );
}
