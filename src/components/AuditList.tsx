type Row = {
  id: string;
  action: string;
  reason: string | null;
  createdAt: Date;
  actorName: string | null;
  changes: unknown;
  label?: string;
};

function show(v: unknown): string {
  if (v == null) return "(none)";
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function AuditList({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-stone-500">No changes recorded.</p>;
  return (
    <ul className="space-y-3 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="border-b border-stone-100 pb-2" data-testid="audit-row">
          <div>
            <strong>{r.action.replaceAll("_", " ")}</strong>
            {r.label && <> · {r.label}</>} · {r.actorName ?? "system"} ·{" "}
            {r.createdAt.toLocaleString("en-US", { timeZone: "America/Chicago" })}
          </div>
          {r.reason && <div className="text-stone-700">Reason: {r.reason}</div>}
          {Array.isArray(r.changes) && r.changes.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {(r.changes as { field: string; old: unknown; new: unknown }[]).map((c, i) => (
                <li key={i} className="break-words">
                  <span className="font-medium">{c.field}:</span> <span className="text-red-700 line-through">{show(c.old)}</span>{" "}
                  → <span className="text-green-800">{show(c.new)}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
