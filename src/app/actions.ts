"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/server/actor";
import {
  ActionError,
  approverEdit,
  gcApprove,
  pmApprove,
  rejectSheet,
  reopenSheet,
  saveDraft,
  submitSheet,
  voidSheet,
} from "@/server/timesheets";
import type { DayInput } from "@/lib/timesheet/hours";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const daysSchema = z
  .array(
    z.object({
      date: z.string(),
      startMinute: z.number().int().nullable(),
      endMinute: z.number().int().nullable(),
      noLunch: z.boolean(),
      entries: z.array(z.object({ projectId: z.string(), phaseId: z.string(), minutes: z.number().int() })).max(20),
    }),
  )
  .max(7);

async function run(fn: () => Promise<unknown>, message?: string): Promise<ActionResult> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Invalid timesheet data" };
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function saveDraftAction(workerId: string, weekStart: string, days: DayInput[]) {
  const me = await requireActor();
  return run(() => saveDraft(me, workerId, weekStart, daysSchema.parse(days)), "Draft saved");
}

export async function submitAction(workerId: string, weekStart: string, days: DayInput[], signatureImage: string, signedName: string) {
  const me = await requireActor();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
  return run(
    () => submitSheet(me, workerId, weekStart, daysSchema.parse(days), { signatureImage, signedName, ip, userAgent: h.get("user-agent") }),
    "Submitted",
  );
}

export async function approverEditAction(sheetId: string, days: DayInput[], reason: string) {
  const me = await requireActor();
  return run(() => approverEdit(me, sheetId, daysSchema.parse(days), reason), "Changes saved. Sheet is back to PM review.");
}

export async function pmApproveAction(sheetId: string, typedSignature: string, comment: string) {
  const me = await requireActor();
  return run(() => pmApprove(me, sheetId, typedSignature, comment), "Approved");
}

export async function gcApproveAction(sheetId: string, typedSignature: string, comment: string) {
  const me = await requireActor();
  return run(() => gcApprove(me, sheetId, typedSignature, comment), "Approved and locked");
}

export async function rejectAction(sheetId: string, comment: string) {
  const me = await requireActor();
  return run(() => rejectSheet(me, sheetId, comment), "Sent back");
}

export async function reopenAction(sheetId: string, reason: string) {
  const me = await requireActor();
  return run(() => reopenSheet(me, sheetId, reason), "Reopened");
}

export async function voidAction(sheetId: string, reason: string) {
  const me = await requireActor();
  return run(() => voidSheet(me, sheetId, reason), "Voided");
}
