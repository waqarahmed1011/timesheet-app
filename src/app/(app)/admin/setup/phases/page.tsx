import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { savePhase } from "@/app/admin-actions";
import { Check, Field, Inactive, RecordForm, SetupShell, Text } from "@/components/Setup";

export default async function Phases({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const items = await db.phase.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const fields = (p?: (typeof items)[number]) => (
    <>
      <Field label="Name"><Text name="name" value={p?.name} required /></Field>
      <Field label="Cost code (optional)"><Text name="costCode" value={p?.costCode} /></Field>
      <Field label="Sort order"><Text name="sortOrder" value={p?.sortOrder ?? 0} /></Field>
      <div className="flex items-end"><Check name="active" checked={p?.active ?? true} label="Active" /></div>
    </>
  );
  return (
    <SetupShell title="Work phases" sp={await searchParams}>
      <RecordForm action={savePhase} summary="Add phase">{fields()}</RecordForm>
      {items.map((p) => (
        <RecordForm key={p.id} id={p.id} action={savePhase} summary={<>{p.name}{p.costCode && <span className="text-xs text-stone-500"> {p.costCode}</span>}<Inactive active={p.active} /></>}>{fields(p)}</RecordForm>
      ))}
    </SetupShell>
  );
}
