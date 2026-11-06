import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, type Change } from "./audit";
import { computeDay, computeSheet, formatHours, formatTime12, type DayInput } from "@/lib/timesheet/hours";
import {
  canGcApprove,
  canRejectSheet,
  canEditAsApprover,
  canEditAsSubmitter,
  canSubmitFor,
  canView,
  isAdmin,
  pmApprovableProjects,
  type Actor,
  type SheetAccess,
} from "@/lib/permissions";
import { canReopen, canVoid, statusAfterPmApproval, STATUS_AFTER_EDIT, type Status } from "@/lib/timesheet/state";
import { isLate, isWeekStart, toDate, toIso, weekDays, dayName, shortDate } from "@/lib/week";

export class ActionError extends Error {}

export const CERTIFICATION_TEXT =
  "I certify that the hours shown on this timesheet are true and correct, that the meal breaks shown were taken, and that I have reported all time worked.";
export const CREW_CERTIFICATION_TEXT =
  "I certify, as foreman, that the hours shown on this timesheet are true and correct for this worker to the best of my knowledge.";

export type EntryDTO = { projectId: string; phaseId: string; minutes: number };
export type DayDTO = {
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  noLunch: boolean;
  lunchMinutes: number;
  paidMinutes: number;
  entries: EntryDTO[];
};
export type ApprovalDTO = {
  id: string;
  cycle: number;
  step: string;
  action: string;
  projectId: string | null;
  projectLabel: string | null;
  approverName: string;
  typedSignature: string | null;
  comment: string | null;
  createdAt: string;
};
export type SheetDTO = {
  id: string | null;
  workerId: string;
  workerName: string;
  workerCompanyId: string;
  companyName: string;
  weekStart: string;
  status: Status;
  cycle: number;
  totalMinutes: number;
  isLate: boolean;
  submittedAt: string | null;
  submittedByName: string | null;
  signedName: string | null;
  signedAt: string | null;
  signatureImage: string | null;
  certificationText: string | null;
  days: DayDTO[];
  approvals: ApprovalDTO[];
  projectIds: string[];
  /** projects PM-approved in the current cycle */
  pmApprovedProjectIds: string[];
};

const sheetInclude = {
  worker: { include: { company: true } },
  submittedBy: true,
  days: { include: { entries: true }, orderBy: { date: "asc" } },
  approvals: { include: { approver: true, project: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TimesheetInclude;

type SheetRow = Prisma.TimesheetGetPayload<{ include: typeof sheetInclude }>;

function toDTO(s: SheetRow): SheetDTO {
  const byDate = new Map(s.days.map((d) => [toIso(d.date), d]));
  const days = weekDays(toIso(s.weekStart)).map((date) => {
    const d = byDate.get(date);
    return {
      date,
      startMinute: d?.startMinute ?? null,
      endMinute: d?.endMinute ?? null,
      noLunch: d?.noLunch ?? false,
      lunchMinutes: d?.lunchMinutes ?? 0,
      paidMinutes: d?.paidMinutes ?? 0,
      entries: (d?.entries ?? []).map((e) => ({ projectId: e.projectId, phaseId: e.phaseId, minutes: e.minutes })),
    };
  });
  const projectIds = [...new Set(days.flatMap((d) => d.entries.map((e) => e.projectId)))];
  return {
    id: s.id,
    workerId: s.workerId,
    workerName: s.worker.name,
    workerCompanyId: s.worker.companyId,
    companyName: s.worker.company.name,
    weekStart: toIso(s.weekStart),
    status: s.status as Status,
    cycle: s.cycle,
    totalMinutes: s.totalMinutes,
    isLate: s.isLate,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    submittedByName: s.submittedBy?.name ?? s.submittedBy?.email ?? null,
    signedName: s.signedName,
    signedAt: s.signedAt?.toISOString() ?? null,
    signatureImage: s.signatureImage,
    certificationText: s.certificationText,
    days,
    projectIds,
    pmApprovedProjectIds: s.approvals
      .filter((a) => a.cycle === s.cycle && a.step === "PM" && a.action === "APPROVE" && a.projectId)
      .map((a) => a.projectId!),
    approvals: s.approvals.map((a) => ({
      id: a.id,
      cycle: a.cycle,
      step: a.step,
      action: a.action,
      projectId: a.projectId,
      projectLabel: a.project ? `${a.project.number} ${a.project.name}` : null,
      approverName: a.approver.name ?? a.approver.email,
      typedSignature: a.typedSignature,
      comment: a.comment,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export function accessOf(s: SheetDTO): SheetAccess {
  return { workerId: s.workerId, workerCompanyId: s.workerCompanyId, status: s.status, projectIds: s.projectIds };
}

/** Load a sheet, or an empty unsaved one for that worker/week. Returns null if the worker doesn't exist. */
export async function loadSheet(workerId: string, weekStart: string): Promise<SheetDTO | null> {
  if (!isWeekStart(weekStart)) throw new ActionError("Week must start on a Sunday");
  const s = await db.timesheet.findUnique({
    where: { workerId_weekStart: { workerId, weekStart: toDate(weekStart) } },
    include: sheetInclude,
  });
  if (s) return toDTO(s);
  const worker = await db.worker.findUnique({ where: { id: workerId }, include: { company: true } });
  if (!worker) return null;
  return {
    id: null,
    workerId,
    workerName: worker.name,
    workerCompanyId: worker.companyId,
    companyName: worker.company.name,
    weekStart,
    status: "DRAFT",
    cycle: 1,
    totalMinutes: 0,
    isLate: false,
    submittedAt: null,
    submittedByName: null,
    signedName: null,
    signedAt: null,
    signatureImage: null,
    certificationText: null,
    days: weekDays(weekStart).map((date) => ({
      date,
      startMinute: null,
      endMinute: null,
      noLunch: false,
      lunchMinutes: 0,
      paidMinutes: 0,
      entries: [],
    })),
    approvals: [],
    projectIds: [],
    pmApprovedProjectIds: [],
  };
}

export async function loadSheetById(id: string): Promise<SheetDTO | null> {
  const s = await db.timesheet.findUnique({ where: { id }, include: sheetInclude });
  return s ? toDTO(s) : null;
}

// ---------- helpers ----------

function normalizeDays(weekStart: string, days: DayInput[]): DayInput[] {
  const expected = weekDays(weekStart);
  const byDate = new Map(days.map((d) => [d.date, d]));
  for (const d of days) if (!expected.includes(d.date)) throw new ActionError(`${d.date} is not in this week`);
  return expected.map((date) => {
    const d = byDate.get(date);
    return {
      date,
      startMinute: d?.startMinute ?? null,
      endMinute: d?.endMinute ?? null,
      noLunch: Boolean(d?.noLunch),
      entries: (d?.entries ?? []).filter((e) => e.projectId || e.phaseId || e.minutes),
    };
  });
}

async function assertActiveRefs(days: DayInput[]) {
  const projectIds = [...new Set(days.flatMap((d) => d.entries.map((e) => e.projectId)).filter(Boolean))];
  const phaseIds = [...new Set(days.flatMap((d) => d.entries.map((e) => e.phaseId)).filter(Boolean))];
  const [projects, phases] = await Promise.all([
    db.project.count({ where: { id: { in: projectIds } } }),
    db.phase.count({ where: { id: { in: phaseIds } } }),
  ]);
  if (projects !== projectIds.length) throw new ActionError("Unknown project on timesheet");
  if (phases !== phaseIds.length) throw new ActionError("Unknown phase on timesheet");
}

async function lookups() {
  const [projects, phases] = await Promise.all([db.project.findMany(), db.phase.findMany()]);
  return {
    project: new Map(projects.map((p) => [p.id, `${p.number} ${p.name}`])),
    phase: new Map(phases.map((p) => [p.id, p.name])),
  };
}

function describeDay(d: DayInput | DayDTO, names: Awaited<ReturnType<typeof lookups>>): string {
  if (d.startMinute == null && d.entries.length === 0) return "(no time)";
  const c = computeDay(d as DayInput);
  const time = `${formatTime12(d.startMinute)}-${formatTime12(d.endMinute)}${d.noLunch ? ", no lunch" : c.lunchMinutes ? ", lunch 0.5" : ""}`;
  const rows = d.entries
    .map((e) => `${names.project.get(e.projectId) ?? "?"} / ${names.phase.get(e.phaseId) ?? "?"} ${formatHours(e.minutes)}h`)
    .join("; ");
  return `${time}: ${rows || "no rows"}`;
}

async function dayChanges(before: (DayInput | DayDTO)[], after: DayInput[]): Promise<Change[]> {
  const names = await lookups();
  const b = new Map(before.map((d) => [d.date, describeDay(d, names)]));
  return after
    .map((d) => ({ field: `${dayName(d.date)} ${shortDate(d.date)}`, old: b.get(d.date) ?? "(no time)", new: describeDay(d, names) }))
    .filter((c) => c.old !== c.new);
}

async function writeDays(tx: Prisma.TransactionClient, sheetId: string, days: DayInput[]) {
  await tx.timesheetDay.deleteMany({ where: { timesheetId: sheetId } });
  for (const d of days) {
    const c = computeDay(d);
    if (d.startMinute == null && d.endMinute == null && d.entries.length === 0) continue;
    await tx.timesheetDay.create({
      data: {
        timesheetId: sheetId,
        date: toDate(d.date),
        startMinute: d.startMinute,
        endMinute: d.endMinute,
        noLunch: d.noLunch,
        lunchMinutes: c.lunchMinutes,
        paidMinutes: c.paidMinutes,
        entries: { create: d.entries.map((e) => ({ projectId: e.projectId, phaseId: e.phaseId, minutes: e.minutes })) },
      },
    });
  }
}

async function requireSheet(id: string): Promise<SheetDTO> {
  const s = await loadSheetById(id);
  if (!s) throw new ActionError("Timesheet not found");
  return s;
}

// ---------- submitter actions ----------

async function prepareSubmitterChange(actor: Actor, workerId: string, weekStart: string) {
  const current = await loadSheet(workerId, weekStart);
  if (!current) throw new ActionError("Worker not found");
  if (!canSubmitFor(actor, workerId, current.workerCompanyId)) throw new ActionError("You can't fill out this worker's timesheet");
  if (current.id && !canEditAsSubmitter(actor, accessOf(current))) {
    throw new ActionError("This timesheet has been submitted and can't be changed");
  }
  return current;
}

export async function saveDraft(actor: Actor, workerId: string, weekStart: string, input: DayInput[]) {
  const current = await prepareSubmitterChange(actor, workerId, weekStart);
  const days = normalizeDays(weekStart, input);
  await assertActiveRefs(days);
  const totals = computeSheet(days);
  const changes = await dayChanges(current.days, days);

  return db.$transaction(async (tx) => {
    const sheet = await tx.timesheet.upsert({
      where: { workerId_weekStart: { workerId, weekStart: toDate(weekStart) } },
      create: { workerId, weekStart: toDate(weekStart), totalMinutes: totals.totalMinutes },
      update: { totalMinutes: totals.totalMinutes },
    });
    await writeDays(tx, sheet.id, days);
    if (changes.length) await audit(tx, { entity: "Timesheet", entityId: sheet.id, action: "save_draft", actorId: actor.id, changes });
    return sheet.id;
  });
}

export type SignatureInput = { signatureImage: string; signedName: string; ip: string | null; userAgent: string | null };

export async function submitSheet(actor: Actor, workerId: string, weekStart: string, input: DayInput[], sig: SignatureInput) {
  const current = await prepareSubmitterChange(actor, workerId, weekStart);
  const days = normalizeDays(weekStart, input);
  await assertActiveRefs(days);
  const totals = computeSheet(days);
  if (!totals.valid) throw new ActionError(totals.errors[0]);
  if (!sig.signedName.trim()) throw new ActionError("Type your name to sign");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig.signatureImage) || sig.signatureImage.length < 200) {
    throw new ActionError("Please sign in the box");
  }
  if (sig.signatureImage.length > 500_000) throw new ActionError("Signature image too large");

  const isCrew = actor.workerId !== workerId;
  const now = new Date();
  const changes = await dayChanges(current.days, days);

  return db.$transaction(async (tx) => {
    const sheet = await tx.timesheet.upsert({
      where: { workerId_weekStart: { workerId, weekStart: toDate(weekStart) } },
      create: { workerId, weekStart: toDate(weekStart) },
      update: {},
    });
    await writeDays(tx, sheet.id, days);
    await tx.timesheet.update({
      where: { id: sheet.id },
      data: {
        status: "SUBMITTED",
        totalMinutes: totals.totalMinutes,
        submittedById: actor.id,
        submittedAt: now,
        isLate: isLate(weekStart, now),
        signatureImage: sig.signatureImage,
        signedName: sig.signedName.trim(),
        signedAt: now,
        signedIp: sig.ip,
        signedUserAgent: sig.userAgent,
        certificationText: isCrew ? CREW_CERTIFICATION_TEXT : CERTIFICATION_TEXT,
      },
    });
    await audit(tx, {
      entity: "Timesheet",
      entityId: sheet.id,
      action: current.status === "REJECTED" ? "resubmit" : "submit",
      actorId: actor.id,
      changes: [{ field: "status", old: current.status, new: "SUBMITTED" }, ...changes],
    });
    return sheet.id;
  });
}

// ---------- approver actions ----------

function stepFor(actor: Actor, s: SheetDTO): "PM" | "GC" {
  return s.projectIds.some((p) => actor.pmProjectIds.includes(p)) ? "PM" : "GC";
}

export async function approverEdit(actor: Actor, sheetId: string, input: DayInput[], reason: string) {
  const s = await requireSheet(sheetId);
  if (!canEditAsApprover(actor, accessOf(s))) throw new ActionError("You can't edit this timesheet");
  if (!reason.trim()) throw new ActionError("A reason is required for edits");
  const days = normalizeDays(s.weekStart, input);
  await assertActiveRefs(days);
  const totals = computeSheet(days);
  if (!totals.valid) throw new ActionError(totals.errors[0]);
  const changes = await dayChanges(s.days, days);
  if (!changes.length) throw new ActionError("Nothing changed");

  await db.$transaction(async (tx) => {
    await writeDays(tx, s.id!, days);
    const cycle = s.cycle + 1;
    await tx.timesheet.update({
      where: { id: s.id! },
      data: { status: STATUS_AFTER_EDIT, cycle, totalMinutes: totals.totalMinutes },
    });
    await tx.approval.create({
      data: { timesheetId: s.id!, cycle: s.cycle, step: stepFor(actor, s), action: "EDIT", approverId: actor.id, comment: reason.trim() },
    });
    await audit(tx, {
      entity: "Timesheet",
      entityId: s.id!,
      action: "approver_edit",
      actorId: actor.id,
      reason: reason.trim(),
      changes: [...changes, ...(s.status !== STATUS_AFTER_EDIT ? [{ field: "status", old: s.status, new: STATUS_AFTER_EDIT }] : [])],
    });
  });
}

export async function pmApprove(actor: Actor, sheetId: string, typedSignature: string, comment?: string) {
  const s = await requireSheet(sheetId);
  if (!typedSignature.trim()) throw new ActionError("Type your name to sign the approval");
  const projects = pmApprovableProjects(actor, accessOf(s), s.pmApprovedProjectIds);
  if (!projects.length) throw new ActionError("Nothing on this timesheet is waiting on your approval");
  const next = statusAfterPmApproval(s.projectIds, [...s.pmApprovedProjectIds, ...projects]);

  await db.$transaction(async (tx) => {
    for (const projectId of projects) {
      await tx.approval.create({
        data: {
          timesheetId: s.id!,
          cycle: s.cycle,
          step: "PM",
          action: "APPROVE",
          projectId,
          approverId: actor.id,
          typedSignature: typedSignature.trim(),
          comment: comment?.trim() || null,
        },
      });
    }
    await tx.timesheet.update({ where: { id: s.id! }, data: { status: next } });
    await audit(tx, {
      entity: "Timesheet",
      entityId: s.id!,
      action: "pm_approve",
      actorId: actor.id,
      changes: [{ field: "status", old: s.status, new: next }, { field: "projects", old: null, new: projects }],
    });
  });
  return next;
}

export async function gcApprove(actor: Actor, sheetId: string, typedSignature: string, comment?: string) {
  const s = await requireSheet(sheetId);
  if (!canGcApprove(actor, accessOf(s))) throw new ActionError("This timesheet isn't ready for GC approval");
  if (!typedSignature.trim()) throw new ActionError("Type your name to sign the approval");
  await db.$transaction(async (tx) => {
    await tx.approval.create({
      data: { timesheetId: s.id!, cycle: s.cycle, step: "GC", action: "APPROVE", approverId: actor.id, typedSignature: typedSignature.trim(), comment: comment?.trim() || null },
    });
    await tx.timesheet.update({ where: { id: s.id! }, data: { status: "LOCKED" } });
    await audit(tx, { entity: "Timesheet", entityId: s.id!, action: "gc_approve", actorId: actor.id, changes: [{ field: "status", old: s.status, new: "LOCKED" }] });
  });
}

export async function rejectSheet(actor: Actor, sheetId: string, comment: string) {
  const s = await requireSheet(sheetId);
  if (!canRejectSheet(actor, accessOf(s))) throw new ActionError("You can't send this timesheet back");
  if (!comment.trim()) throw new ActionError("Say what needs fixing");
  await db.$transaction(async (tx) => {
    await tx.approval.create({
      data: { timesheetId: s.id!, cycle: s.cycle, step: stepFor(actor, s), action: "REJECT", approverId: actor.id, comment: comment.trim() },
    });
    await tx.timesheet.update({ where: { id: s.id! }, data: { status: "REJECTED", cycle: s.cycle + 1 } });
    await audit(tx, { entity: "Timesheet", entityId: s.id!, action: "reject", actorId: actor.id, reason: comment.trim(), changes: [{ field: "status", old: s.status, new: "REJECTED" }] });
  });
}

export async function reopenSheet(actor: Actor, sheetId: string, reason: string) {
  const s = await requireSheet(sheetId);
  if (!isAdmin(actor)) throw new ActionError("Only an admin can reopen a locked timesheet");
  if (!canReopen(s.status)) throw new ActionError("Only locked timesheets can be reopened");
  if (!reason.trim()) throw new ActionError("A reason is required to reopen");
  await db.$transaction(async (tx) => {
    await tx.approval.create({
      data: { timesheetId: s.id!, cycle: s.cycle, step: "ADMIN", action: "REOPEN", approverId: actor.id, comment: reason.trim() },
    });
    await tx.timesheet.update({ where: { id: s.id! }, data: { status: "SUBMITTED", cycle: s.cycle + 1 } });
    await audit(tx, { entity: "Timesheet", entityId: s.id!, action: "reopen", actorId: actor.id, reason: reason.trim(), changes: [{ field: "status", old: s.status, new: "SUBMITTED" }] });
  });
}

export async function voidSheet(actor: Actor, sheetId: string, reason: string) {
  const s = await requireSheet(sheetId);
  if (!isAdmin(actor)) throw new ActionError("Only an admin can void a timesheet");
  if (!canVoid(s.status)) throw new ActionError("Locked timesheets must be reopened before voiding");
  if (!reason.trim()) throw new ActionError("A reason is required to void");
  await db.$transaction(async (tx) => {
    await tx.approval.create({
      data: { timesheetId: s.id!, cycle: s.cycle, step: "ADMIN", action: "VOID", approverId: actor.id, comment: reason.trim() },
    });
    await tx.timesheet.update({ where: { id: s.id! }, data: { status: "VOID" } });
    await audit(tx, { entity: "Timesheet", entityId: s.id!, action: "void", actorId: actor.id, reason: reason.trim(), changes: [{ field: "status", old: s.status, new: "VOID" }] });
  });
}

export function viewable(actor: Actor, s: SheetDTO) {
  return canView(actor, accessOf(s));
}
