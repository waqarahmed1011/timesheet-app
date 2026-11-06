import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/actor";
import { isOffice } from "@/lib/permissions";
import { isWeekStart } from "@/lib/week";
import { recordExport, weekSheets, weekWorkbook, weekZip } from "@/server/exports";
import { COMPANY_NAME } from "@/lib/config";

export async function GET(req: NextRequest, { params }: { params: Promise<{ weekStart: string }> }) {
  const me = await getActor();
  if (!me) return new NextResponse("Sign in required", { status: 401 });
  if (!isOffice(me)) return new NextResponse("Forbidden", { status: 403 });
  const { weekStart } = await params;
  if (!isWeekStart(weekStart)) return new NextResponse("Week must start on a Sunday", { status: 400 });
  const format = req.nextUrl.searchParams.get("format") === "zip" ? "zip" : "xlsx";
  const sheets = await weekSheets(weekStart);
  const base = `${COMPANY_NAME.replace(/[^a-z0-9]+/gi, "-")}_timesheets_${weekStart}`;
  const [bytes, type, filename] =
    format === "zip"
      ? [await weekZip(weekStart, sheets), "application/zip", `${base}.zip`]
      : [await weekWorkbook(weekStart, sheets), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${base}.xlsx`];
  await recordExport(me.id, `week_${format}`, { weekStart, sheetCount: sheets.length }, filename, type, bytes);
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` } });
}
