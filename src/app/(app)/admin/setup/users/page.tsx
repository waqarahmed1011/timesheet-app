import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { saveUser } from "@/app/admin-actions";
import { Check, Field, Inactive, RecordForm, Select, SetupShell, Text } from "@/components/Setup";

const ROLES = [["ADMIN", "Admin (office)"], ["GC", "GC approver"], ["PM", "Project manager"], ["FOREMAN", "Foreman"], ["WORKER", "Worker"]];

export default async function Users({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const [items, companies] = await Promise.all([
    db.user.findMany({ include: { company: true, worker: true }, orderBy: { name: "asc" } }),
    db.company.findMany({ orderBy: { name: "asc" } }),
  ]);
  const fields = (u?: (typeof items)[number]) => (
    <>
      <Field label="Name"><Text name="name" value={u?.name} required /></Field>
      <Field label="Email (their Google account or the address for sign-in links)"><Text name="email" value={u?.email} required /></Field>
      <Field label="Company"><Select name="companyId" value={u?.companyId} options={companies.map((c) => ({ id: c.id, label: c.name }))} empty="--" /></Field>
      <div className="flex flex-wrap items-end">{ROLES.map(([r, l]) => <Check key={r} name="roles" value={r} label={l} checked={u?.roles.includes(r as never)} />)}<Check name="active" checked={u?.active ?? true} label="Active" /></div>
    </>
  );
  return (
    <SetupShell title="Users" sp={await searchParams}>
      <p className="text-sm text-stone-600">A user who fills out their own timesheet also needs a Worker record linked to them (Setup / Workers).</p>
      <RecordForm action={saveUser} summary="Add user">{fields()}</RecordForm>
      {items.map((u) => (
        <RecordForm key={u.id} id={u.id} action={saveUser} summary={<>{u.name} <span className="text-xs text-stone-500">{u.email} · {u.roles.join(", ")} · {u.company?.name ?? "no company"}{u.worker ? "" : " · no worker record"}</span><Inactive active={u.active} /></>}>{fields(u)}</RecordForm>
      ))}
    </SetupShell>
  );
}
