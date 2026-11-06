import { NextResponse } from "next/server";
import { getActor } from "@/server/actor";
import { isOffice } from "@/lib/permissions";
import { db } from "@/lib/db";

// Re-download the exact file generated earlier.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getActor();
  if (!me || !isOffice(me)) return new NextResponse("Forbidden", { status: 403 });
  const f = await db.exportFile.findUnique({ where: { id: (await params).id } });
  if (!f) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "Content-Type": f.contentType, "Content-Disposition": `attachment; filename="${f.filename}"` } });
}
