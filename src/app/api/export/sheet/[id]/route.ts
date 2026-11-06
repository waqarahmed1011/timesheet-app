import { NextResponse } from "next/server";
import { getActor } from "@/server/actor";
import { loadSheetById, viewable } from "@/server/timesheets";
import { projectAndPhaseOptions } from "@/server/lookups";
import { sheetPdf } from "@/server/pdf";
import { recordExport, slug } from "@/server/exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getActor();
  if (!me) return new NextResponse("Sign in required", { status: 401 });
  const sheet = await loadSheetById((await params).id);
  if (!sheet || !viewable(me, sheet)) return new NextResponse("Not found", { status: 404 });
  const { projectNames, phaseNames } = await projectAndPhaseOptions();
  const bytes = await sheetPdf(sheet, projectNames, phaseNames);
  const filename = `timesheet_${slug(sheet.workerName)}_${sheet.weekStart}.pdf`;
  await recordExport(me.id, "sheet_pdf", { sheetId: sheet.id, status: sheet.status, cycle: sheet.cycle }, filename, "application/pdf", bytes);
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
