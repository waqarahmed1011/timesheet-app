import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL, type Status } from "@/lib/timesheet/state";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-stone-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold">{children}</h1>
      {sub && <p className="text-sm text-stone-600">{sub}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  DRAFT: "bg-stone-200 text-stone-800",
  SUBMITTED: "bg-amber-100 text-amber-900",
  PM_APPROVED: "bg-sky-100 text-sky-900",
  LOCKED: "bg-green-100 text-green-900",
  REJECTED: "bg-red-100 text-red-900",
  VOID: "bg-stone-300 text-stone-600 line-through",
};

export function StatusBadge({ status }: { status: Status | "MISSING" }) {
  if (status === "MISSING") return <span className="rounded px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Missing</span>;
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Flag({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "red" | "sky" }) {
  const t = { amber: "bg-amber-50 text-amber-800 border-amber-200", red: "bg-red-50 text-red-700 border-red-200", sky: "bg-sky-50 text-sky-800 border-sky-200" }[tone];
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" }) {
  const v = variant === "primary" ? "bg-orange-600 text-white hover:bg-orange-700" : "bg-white border border-stone-300 hover:bg-stone-50";
  return (
    <Link href={href} className={`inline-block rounded-md px-4 py-2 text-sm font-semibold ${v}`}>
      {children}
    </Link>
  );
}

export const btn = {
  primary: "rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50",
  secondary: "rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50",
  danger: "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50",
  small: "rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium hover:bg-stone-50",
};

export const input = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 focus:border-orange-500 focus:outline-none";
