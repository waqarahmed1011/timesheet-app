import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { saveCompany } from "@/app/admin-actions";
import { Check, Field, Inactive, RecordForm, SetupShell, Text } from "@/components/Setup";

export default async function Companies({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const items = await db.company.findMany({ orderBy: [{ isOwnCompany: "desc" }, { name: "asc" }] });
  const fields = (c?: (typeof items)[number]) => (
    <>
      <Field label="Name"><Text name="name" value={c?.name} required /></Field>
      <div className="flex items-end"><Check name="isOwnCompany" checked={c?.isOwnCompany} label="This is my company" /><Check name="active" checked={c?.active ?? true} label="Active" /></div>
    </>
  );
  return (
    <SetupShell title="Companies" sp={await searchParams}>
      <RecordForm action={saveCompany} summary="Add company">{fields()}</RecordForm>
      {items.map((c) => (
        <RecordForm key={c.id} id={c.id} action={saveCompany} summary={<>{c.name}{c.isOwnCompany && " (my company)"}<Inactive active={c.active} /></>}>{fields(c)}</RecordForm>
      ))}
    </SetupShell>
  );
}
