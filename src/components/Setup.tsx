import Link from "next/link";
import type { ReactNode } from "react";
import { btn, input } from "./ui";

export function SetupShell({ title, sp, children }: { title: string; sp: { error?: string; saved?: string }; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="text-sm"><Link className="underline" href="/admin/setup">Setup</Link> / {title}</div>
      <h1 className="text-xl font-bold">{title}</h1>
      {sp.error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{sp.error}</p>}
      {sp.saved && <p className="rounded bg-green-50 p-2 text-sm text-green-800">Saved.</p>}
      {children}
    </div>
  );
}

/** Collapsible edit form for an existing record, or an open "Add" form when id is undefined. */
export function RecordForm({ action, id, summary, children }: { action: (fd: FormData) => Promise<void>; id?: string; summary: ReactNode; children: ReactNode }) {
  const form = (
    <form action={action} className="mt-2 grid gap-2 sm:grid-cols-2">
      {id && <input type="hidden" name="id" value={id} />}
      {children}
      <div className="sm:col-span-2"><button className={btn.primary}>{id ? "Save" : "Add"}</button></div>
    </form>
  );
  if (!id) {
    return (
      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
        <div className="font-semibold">{summary}</div>
        {form}
      </div>
    );
  }
  return (
    <details className="rounded-lg border border-stone-200 bg-white p-3">
      <summary className="cursor-pointer">{summary}</summary>
      {form}
    </details>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}><span className="text-stone-600">{label}</span>{children}</label>;
}

export function Text({ name, value, required, placeholder }: { name: string; value?: string | number | null; required?: boolean; placeholder?: string }) {
  return <input name={name} defaultValue={value ?? ""} required={required} placeholder={placeholder} className={input} />;
}

export function Check({ name, checked, label, value }: { name: string; checked?: boolean; label: string; value?: string }) {
  return (
    <label className="mr-3 inline-flex items-center gap-1 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} /> {label}
    </label>
  );
}

export function Select({ name, value, options, empty }: { name: string; value?: string | null; options: { id: string; label: string }[]; empty?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={input}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

export const Inactive = ({ active }: { active: boolean }) => (active ? null : <span className="ml-2 text-xs text-stone-500">(inactive)</span>);
