import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/server/actor";
import { accessOf, CERTIFICATION_TEXT, CREW_CERTIFICATION_TEXT, loadSheet, viewable } from "@/server/timesheets";
import { projectAndPhaseOptions } from "@/server/lookups";
import { canEditAsApprover, canEditAsSubmitter, canGcApprove, canRejectSheet, canSubmitFor, isAdmin, pmApprovableProjects } from "@/lib/permissions";
import { canReopen, canVoid } from "@/lib/timesheet/state";
import { addDays, dueAt, isWeekStart, weekLabel } from "@/lib/week";
import { formatHours } from "@/lib/timesheet/hours";
import { SheetEditor } from "@/components/SheetEditor";
import { SheetView } from "@/components/SheetView";
import { ReviewPanel } from "@/components/ReviewPanel";
import { Card, Flag, StatusBadge } from "@/components/ui";
import { AuditList } from "@/components/AuditList";
import { db } from "@/lib/db";

const ACTION_LABEL: Record<string, string> = {
  APPROVE: "Approved",
  REJECT: "Sent back",
  EDIT: "Edited",
  REOPEN: "Reopened",
  VOID: "Voided",
};

export default async function SheetPage({ params }: { params: Promise<{ workerId: string; weekStart: string }> }) {
  const { workerId, weekStart } = await params;
  if (!isWeekStart(weekStart)) notFound();
  const me = await requireActor();
  const sheet = await loadSheet(workerId, weekStart);
  if (!sheet) notFound();
  const access = accessOf(sheet);
  const mayFill = canSubmitFor(me, workerId, sheet.workerCompanyId);
  if (sheet.id ? !viewable(me, sheet) : !mayFill) notFound();

  const opts = await projectAndPhaseOptions();
  // keep inactive projects/phases that are already on the sheet selectable
  const usedProjects = new Set(sheet.days.flatMap((d) => d.entries.map((e) => e.projectId)));
  const usedPhases = new Set(sheet.days.flatMap((d) => d.entries.map((e) => e.phaseId)));
  const projects = [...opts.projects, ...[...usedProjects].filter((id) => !opts.projects.some((p) => p.id === id)).map((id) => ({ id, label: `${opts.projectNames[id]} (inactive)` }))];
  const phases = [...opts.phases, ...[...usedPhases].filter((id) => !opts.phases.some((p) => p.id === id)).map((id) => ({ id, label: `${opts.phaseNames[id]} (inactive)` }))];

  const submitterEdit = sheet.id ? canEditAsSubmitter(me, access) : mayFill;
  const isCrew = me.workerId !== workerId;
  const pmProjectIds = sheet.id ? pmApprovableProjects(me, access, sheet.pmApprovedProjectIds) : [];
  const lastReject = [...sheet.approvals].reverse().find((a) => a.action === "REJECT");
  const editsThisSheet = sheet.approvals.filter((a) => a.action === "EDIT");
  const now = new Date();
  const log = sheet.id
    ? await db.auditLog.findMany({ where: { entity: "Timesheet", entityId: sheet.id }, include: { actor: true }, orderBy: { createdAt: "desc" } })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{sheet.workerName}</h1>
          <p className="text-sm text-stone-600">{sheet.companyName} · Week {weekLabel(weekStart)} (Sun-Sat)</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <StatusBadge status={sheet.status} />
            {sheet.isLate && <Flag tone="red">Late</Flag>}
            {sheet.totalMinutes > 2400 && <Flag>Over 40 ({formatHours(sheet.totalMinutes - 2400)}h OT)</Flag>}
            {editsThisSheet.length > 0 && <Flag tone="sky">Edited by approver</Flag>}
            {!sheet.submittedAt && now > dueAt(weekStart) && <Flag tone="red">Past due</Flag>}
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Link className="underline" href={`/sheet/${workerId}/${addDays(weekStart, -7)}`}>← Prev week</Link>
          <Link className="underline" href={`/sheet/${workerId}/${addDays(weekStart, 7)}`}>Next week →</Link>
        </div>
      </div>

      {sheet.status === "REJECTED" && lastReject && (
        <Card className="border-red-300 bg-red-50">
          <p className="font-semibold text-red-800">Sent back by {lastReject.approverName}</p>
          <p className="text-sm text-red-900">{lastReject.comment}</p>
          <p className="mt-1 text-xs text-red-700">Fix the hours, then sign and submit again.</p>
        </Card>
      )}

      {submitterEdit ? (
        <SheetEditor
          mode="submit"
          workerId={workerId}
          weekStart={weekStart}
          days={sheet.days}
          projects={projects}
          phases={phases}
          certificationText={isCrew ? CREW_CERTIFICATION_TEXT : CERTIFICATION_TEXT}
          defaultSignName={me.name}
        />
      ) : (
        <SheetView sheet={sheet} projectNames={opts.projectNames} phaseNames={opts.phaseNames} />
      )}

      {sheet.id && (
        <ReviewPanel
          sheet={sheet}
          projects={projects}
          phases={phases}
          pmProjects={pmProjectIds.map((id) => opts.projectNames[id])}
          canGc={canGcApprove(me, access)}
          canReject={canRejectSheet(me, access)}
          canEdit={canEditAsApprover(me, access)}
          canReopen={isAdmin(me) && canReopen(sheet.status)}
          canVoid={isAdmin(me) && canVoid(sheet.status)}
          myName={me.name}
        />
      )}

      {sheet.signedAt && (
        <Card>
          <h2 className="mb-1 font-semibold">Signature</h2>
          <p className="text-xs text-stone-600">{sheet.certificationText}</p>
          {sheet.signatureImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sheet.signatureImage} alt="Signature" className="my-2 h-20 border border-stone-200 bg-white" />
          )}
          <p className="text-sm">
            {sheet.signedName}, {new Date(sheet.signedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}
            {sheet.submittedByName && sheet.submittedByName !== sheet.signedName && <> (submitted by {sheet.submittedByName})</>}
          </p>
        </Card>
      )}

      {sheet.approvals.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Approval history</h2>
          <ul className="space-y-2 text-sm">
            {sheet.approvals.map((a) => (
              <li key={a.id} className={a.cycle !== sheet.cycle ? "text-stone-500" : ""}>
                <strong>{ACTION_LABEL[a.action]}</strong> ({a.step}{a.projectLabel ? `, ${a.projectLabel}` : ""}) by {a.approverName}
                {a.typedSignature && <> · signed &quot;{a.typedSignature}&quot;</>} · {new Date(a.createdAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}
                {a.comment && <div className="text-stone-700">&quot;{a.comment}&quot;</div>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">Greyed entries belong to an earlier review round (before an edit, send-back or reopen).</p>
        </Card>
      )}

      {sheet.id && (
        <>
          <a className="inline-block text-sm underline" href={`/api/export/sheet/${sheet.id}`}>Download PDF</a>
          <details className="rounded-lg border border-stone-200 bg-white p-3">
            <summary className="cursor-pointer font-semibold">Change log ({log.length})</summary>
            <div className="mt-2">
              <AuditList rows={log.map((l) => ({ ...l, actorName: l.actor?.name ?? l.actor?.email ?? null }))} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}
