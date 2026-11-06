import { requireRole } from "@/server/actor";
import { db } from "@/lib/db";
import { saveProject } from "@/app/admin-actions";
import { Check, Field, Inactive, RecordForm, Select, SetupShell, Text } from "@/components/Setup";

const TYPES = [
  { id: "PRIVATE", label: "Private" },
  { id: "IL_PREVAILING_WAGE", label: "Illinois prevailing wage" },
  { id: "FEDERAL_DAVIS_BACON", label: "Federal (Davis-Bacon)" },
];

export default async function Projects({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  await requireRole("ADMIN");
  const [items, users] = await Promise.all([
    db.project.findMany({ include: { pm: true, assignments: true }, orderBy: { number: "asc" } }),
    db.user.findMany({ where: { active: true }, include: { company: true }, orderBy: { name: "asc" } }),
  ]);
  const pms = users.filter((u) => u.roles.includes("PM")).map((u) => ({ id: u.id, label: u.name ?? u.email }));
  const foremen = users.filter((u) => u.roles.includes("FOREMAN"));
  const fields = (p?: (typeof items)[number]) => (
    <>
      <Field label="Project number"><Text name="number" value={p?.number} required /></Field>
      <Field label="Project name"><Text name="name" value={p?.name} required /></Field>
      <Field label="Address"><Text name="address" value={p?.address} /></Field>
      <Field label="County"><Text name="county" value={p?.county} /></Field>
      <Field label="Type"><Select name="type" value={p?.type} options={TYPES} /></Field>
      <Field label="Project manager (first approval)"><Select name="pmUserId" value={p?.pmUserId} options={pms} empty="-- none --" /></Field>
      <Field label="Foremen on this project (can see all hours on it)" wide>
        <div>{foremen.map((f) => <Check key={f.id} name="foremen" value={f.id} label={`${f.name} (${f.company?.name ?? ""})`} checked={p?.assignments.some((a) => a.userId === f.id)} />)}</div>
      </Field>
      <div><Check name="active" checked={p?.active ?? true} label="Active (shows on timesheets)" /></div>
    </>
  );
  return (
    <SetupShell title="Projects" sp={await searchParams}>
      <RecordForm action={saveProject} summary="Add project">{fields()}</RecordForm>
      {items.map((p) => (
        <RecordForm key={p.id} id={p.id} action={saveProject} summary={<>{p.number} {p.name} <span className="text-xs text-stone-500">PM: {p.pm?.name ?? "none"}</span><Inactive active={p.active} /></>}>{fields(p)}</RecordForm>
      ))}
    </SetupShell>
  );
}
