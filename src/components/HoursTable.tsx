import { Fragment } from "react";
import { formatHours } from "@/lib/timesheet/hours";
import type { HoursRow } from "@/server/dashboard";

export function HoursTable({ rows }: { rows: HoursRow[] }) {
  if (!rows.length) return <p className="text-sm text-stone-500">No submitted hours.</p>;
  const byProject = new Map<string, HoursRow[]>();
  for (const r of rows) byProject.set(r.projectNumber, [...(byProject.get(r.projectNumber) ?? []), r]);
  const total = rows.reduce((t, r) => t + r.minutes, 0);
  return (
    <table className="w-full text-sm">
      <tbody>
        {[...byProject].map(([num, rs]) => (
          <Fragment key={num}>
            <tr className="border-t border-stone-200 font-semibold">
              <td className="pt-2">{num} {rs[0].projectName}</td>
              <td className="pt-2 text-right">{formatHours(rs.reduce((t, r) => t + r.minutes, 0))}</td>
            </tr>
            {rs.map((r) => (
              <tr key={num + r.phase} className="text-stone-600">
                <td className="pl-4">{r.phase}</td>
                <td className="text-right">{formatHours(r.minutes)}</td>
              </tr>
            ))}
          </Fragment>
        ))}
        <tr className="border-t-2 border-stone-300 font-bold"><td className="pt-1">Total</td><td className="pt-1 text-right">{formatHours(total)}</td></tr>
      </tbody>
    </table>
  );
}
