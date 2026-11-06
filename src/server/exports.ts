import "server-only";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { computeDay, formatTime12, WEEKLY_OT_THRESHOLD } from "@/lib/timesheet/hours";
import { STATUS_LABEL, type Status } from "@/lib/timesheet/state";
import { dayName, toDate, toIso, weekEnd } from "@/lib/week";
import { COMPANY_NAME } from "@/lib/config";
import { loadSheetById, type SheetDTO } from "./timesheets";
import { projectAndPhaseOptions } from "./lookups";
import { sheetPdf } from "./pdf";

export async function recordExport(createdById: string, kind: string, params: object, filename: string, contentType: string, bytes: Buffer) {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return db.exportFile.create({ data: { createdById, kind, params, filename, contentType, checksum, bytes: new Uint8Array(bytes) } });
}

export function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

export async function weekSheets(weekStart: string): Promise<SheetDTO[]> {
  const rows = await db.timesheet.findMany({
    where: { weekStart: toDate(weekStart), status: { not: "VOID" } },
    select: { id: true },
  });
  const sheets = await Promise.all(rows.map((r) => loadSheetById(r.id)));
  return (sheets.filter(Boolean) as SheetDTO[]).sort((a, b) => a.companyName.localeCompare(b.companyName) || a.workerName.localeCompare(b.workerName));
}

const hrs = (m: number) => Math.round((m / 60) * 100) / 100;

export async function weekWorkbook(weekStart: string, sheets: SheetDTO[]): Promise<Buffer> {
  const { projectsById, phaseNames } = await projectAndPhaseOptions();
  const phases = await db.phase.findMany();
  const costCode = new Map(phases.map((p) => [p.id, p.costCode ?? ""]));
  const workers = await db.worker.findMany({ where: { id: { in: sheets.map((s) => s.workerId) } } });
  const workerType = new Map(workers.map((w) => [w.id, w.type === "OWN" ? "Employee" : "Subcontractor"]));

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  const title = `${COMPANY_NAME}: week ${weekStart} to ${weekEnd(weekStart)}`;

  const sum = wb.addWorksheet("Summary");
  sum.addRow([title]).font = { bold: true, size: 13 };
  sum.addRow(["Only sheets with status 'Approved (locked)' are final. OT here is informational (over 40 hrs/week)."]);
  sum.addRow([]);
  const head = sum.addRow(["Worker", "Company", "Type", "Status", "Total hrs", "Regular hrs", "Over 40 hrs", "Submitted", "Late", "PM approval(s)", "GC approval"]);
  head.font = { bold: true };
  for (const s of sheets) {
    const cur = s.approvals.filter((a) => a.cycle === s.cycle && a.action === "APPROVE");
    sum.addRow([
      s.workerName,
      s.companyName,
      workerType.get(s.workerId) ?? "",
      STATUS_LABEL[s.status as Status],
      hrs(s.totalMinutes),
      hrs(Math.min(s.totalMinutes, WEEKLY_OT_THRESHOLD)),
      hrs(Math.max(0, s.totalMinutes - WEEKLY_OT_THRESHOLD)),
      s.submittedAt ? new Date(s.submittedAt) : "",
      s.isLate ? "Yes" : "",
      cur.filter((a) => a.step === "PM").map((a) => `${a.typedSignature} ${toIso(new Date(a.createdAt))}`).join("; "),
      cur.filter((a) => a.step === "GC").map((a) => `${a.typedSignature} ${toIso(new Date(a.createdAt))}`).join("; "),
    ]);
  }
  sum.columns.forEach((c, i) => (c.width = [24, 22, 14, 18, 10, 11, 11, 20, 6, 30, 24][i]));

  const det = wb.addWorksheet("Detail");
  det.addRow(["Worker", "Company", "Date", "Day", "Start", "End", "Lunch", "Day paid hrs", "Project #", "Project", "Phase", "Cost code", "Hours", "Status"]).font = { bold: true };
  for (const s of sheets) {
    for (const d of s.days) {
      const c = computeDay(d);
      for (const e of d.entries) {
        const p = projectsById.get(e.projectId);
        det.addRow([
          s.workerName, s.companyName, d.date, dayName(d.date), formatTime12(d.startMinute), formatTime12(d.endMinute),
          d.noLunch ? "None" : c.lunchMinutes ? "0.5" : "", hrs(d.paidMinutes), p?.number, p?.name, phaseNames[e.phaseId], costCode.get(e.phaseId), hrs(e.minutes), STATUS_LABEL[s.status as Status],
        ]);
      }
    }
  }
  det.columns.forEach((c) => (c.width = 14));

  const byProj = wb.addWorksheet("By project");
  byProj.addRow(["Project #", "Project", "Phase", "Cost code", "Employee hrs", "Sub hrs", "Total hrs"]).font = { bold: true };
  const agg = new Map<string, { own: number; sub: number }>();
  for (const s of sheets) {
    const isOwn = workerType.get(s.workerId) === "Employee";
    for (const d of s.days) for (const e of d.entries) {
      const k = `${e.projectId}|${e.phaseId}`;
      const a = agg.get(k) ?? { own: 0, sub: 0 };
      if (isOwn) a.own += e.minutes; else a.sub += e.minutes;
      agg.set(k, a);
    }
  }
  for (const [k, a] of [...agg].sort()) {
    const [pid, ph] = k.split("|");
    const p = projectsById.get(pid);
    byProj.addRow([p?.number, p?.name, phaseNames[ph], costCode.get(ph), hrs(a.own), hrs(a.sub), hrs(a.own + a.sub)]);
  }
  byProj.columns.forEach((c) => (c.width = 16));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function weekZip(weekStart: string, sheets: SheetDTO[]): Promise<Buffer> {
  const { projectNames, phaseNames } = await projectAndPhaseOptions();
  const zip = new JSZip();
  zip.file(`timesheets-${weekStart}.xlsx`, await weekWorkbook(weekStart, sheets));
  for (const s of sheets) {
    zip.file(`pdf/${slug(s.companyName)}_${slug(s.workerName)}_${weekStart}.pdf`, await sheetPdf(s, projectNames, phaseNames));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
