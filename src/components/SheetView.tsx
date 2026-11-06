import { computeDay, formatHours, formatTime12 } from "@/lib/timesheet/hours";
import { dayName, shortDate } from "@/lib/week";
import type { SheetDTO } from "@/server/timesheets";

export function SheetView({ sheet, projectNames, phaseNames }: { sheet: SheetDTO; projectNames: Record<string, string>; phaseNames: Record<string, string> }) {
  const byProject = new Map<string, number>();
  for (const d of sheet.days) for (const e of d.entries) byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + e.minutes);

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-100 text-left text-xs uppercase text-stone-600">
          <tr>
            <th className="p-2">Day</th>
            <th className="p-2">Time</th>
            <th className="p-2">Project / phase</th>
            <th className="p-2 text-right">Hours</th>
          </tr>
        </thead>
        <tbody>
          {sheet.days.map((d) => {
            const c = computeDay(d);
            const empty = d.startMinute == null && d.entries.length === 0;
            return (
              <tr key={d.date} className="border-t border-stone-100 align-top">
                <td className="p-2 whitespace-nowrap font-medium">{dayName(d.date)} {shortDate(d.date)}</td>
                <td className="p-2 text-stone-600">
                  {empty ? "-" : (
                    <>
                      {formatTime12(d.startMinute)} - {formatTime12(d.endMinute)}
                      <div className="text-xs">{d.noLunch ? "No lunch taken" : c.lunchMinutes ? "30 min lunch" : ""}</div>
                    </>
                  )}
                </td>
                <td className="p-2">
                  {d.entries.map((e, i) => (
                    <div key={i}>
                      {projectNames[e.projectId] ?? "?"} / {phaseNames[e.phaseId] ?? "?"}: {formatHours(e.minutes)}h
                    </div>
                  ))}
                </td>
                <td className="p-2 text-right font-semibold">{empty ? "" : formatHours(d.paidMinutes)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-stone-300">
          {[...byProject].map(([p, m]) => (
            <tr key={p} className="text-stone-600">
              <td className="p-2" colSpan={3}>{projectNames[p]}</td>
              <td className="p-2 text-right">{formatHours(m)}</td>
            </tr>
          ))}
          <tr>
            <td className="p-2 font-bold" colSpan={3}>Week total</td>
            <td className="p-2 text-right font-bold" data-testid="view-total">{formatHours(sheet.totalMinutes)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
