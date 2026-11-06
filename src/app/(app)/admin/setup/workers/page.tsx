import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { saveWorker } from "@/app/admin-actions";
import { Check, Field, Inactive, RecordForm, Select, SetupShell, Text } from "@/components/Setup";

export default async function Workers({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const [items, companies, users] = await Promise.all([
    db.worker.findMany({ include: { company: true, user: true }, orderBy: [{ company: { name: "asc" } }, { name: "asc" }] }),
    db.company.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ include: { worker: true }, orderBy: { name: "asc" } }),
  ]);
  const fields = (w?: (typeof items)[number]) => (
    <>
      <Field label="Name"><Text name="name" value={w?.name} required /></Field>
      <Field label="Company"><Select name="companyId" value={w?.companyId} options={companies.map((c) => ({ id: c.id, label: c.name }))} /></Field>
      <Field label="Type"><Select name="type" value={w?.type} options={[{ id: "OWN", label: "Our employee (payroll)" }, { id: "SUB", label: "Subcontractor's worker (hours only)" }]} /></Field>
      <Field label="Login (leave empty if a foreman fills it out)">
        <Select name="userId" value={w?.userId} empty="No login" options={users.filter((u) => !u.worker || u.worker.id === w?.id).map((u) => ({ id: u.id, label: `${u.name} (${u.email})` }))} />
      </Field>
      <Field label="Trade classification (for certified payroll later)"><Text name="classification" value={w?.classification} placeholder="e.g. Laborer" /></Field>
      <div className="flex items-end"><Check name="active" checked={w?.active ?? true} label="Active" /></div>
    </>
  );
  return (
    <SetupShell title="Workers" sp={await searchParams}>
      <RecordForm action={saveWorker} summary="Add worker">{fields()}</RecordForm>
      {items.map((w) => (
        <RecordForm key={w.id} id={w.id} action={saveWorker} summary={<>{w.name} <span className="text-xs text-stone-500">{w.company.name} · {w.type === "OWN" ? "employee" : "sub"}{w.user ? ` · ${w.user.email}` : " · no login"}</span><Inactive active={w.active} /></>}>{fields(w)}</RecordForm>
      ))}
    </SetupShell>
  );
}
