import { NextResponse, type NextRequest } from "next/server";
import { isIsoDate, weekStartOf } from "@/lib/week";

// Jump to the week containing a given date: /go?w=<workerId>&d=YYYY-MM-DD
export function GET(req: NextRequest) {
  const w = req.nextUrl.searchParams.get("w") ?? "";
  const d = req.nextUrl.searchParams.get("d") ?? "";
  if (!w || !isIsoDate(d)) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.redirect(new URL(`/sheet/${encodeURIComponent(w)}/${weekStartOf(d)}`, req.url));
}
