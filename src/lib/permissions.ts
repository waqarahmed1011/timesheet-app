import type { Role, Status } from "./timesheet/state";
import { isApproverEditable, isSubmitterEditable } from "./timesheet/state";

export type Actor = {
  id: string;
  roles: Role[];
  companyId: string | null;
  workerId: string | null;
  /** projects where this user is assigned (foremen) */
  assignedProjectIds: string[];
  /** projects where this user is the PM */
  pmProjectIds: string[];
};

export type SheetAccess = {
  workerId: string;
  workerCompanyId: string;
  status: Status;
  projectIds: string[];
};

export const has = (a: Actor, r: Role) => a.roles.includes(r);
export const isAdmin = (a: Actor) => has(a, "ADMIN");
export const isGc = (a: Actor) => has(a, "GC");
export const isOffice = (a: Actor) => isAdmin(a) || isGc(a);

/** Foreman of the worker's company can submit for them (crew sheets). */
export function canSubmitFor(a: Actor, workerId: string, workerCompanyId: string): boolean {
  if (a.workerId === workerId) return true;
  if (isAdmin(a)) return true;
  return has(a, "FOREMAN") && a.companyId === workerCompanyId;
}

export function canView(a: Actor, s: SheetAccess): boolean {
  if (isOffice(a)) return true;
  if (canSubmitFor(a, s.workerId, s.workerCompanyId)) return true;
  if (s.projectIds.some((p) => a.pmProjectIds.includes(p))) return true;
  // foremen see all hours on projects they're assigned to
  if (has(a, "FOREMAN") && s.projectIds.some((p) => a.assignedProjectIds.includes(p))) return true;
  return false;
}

export function canEditAsSubmitter(a: Actor, s: SheetAccess): boolean {
  return isSubmitterEditable(s.status) && canSubmitFor(a, s.workerId, s.workerCompanyId);
}

export function isApproverFor(a: Actor, s: SheetAccess): boolean {
  return isGc(a) || s.projectIds.some((p) => a.pmProjectIds.includes(p));
}

export function canEditAsApprover(a: Actor, s: SheetAccess): boolean {
  return isApproverEditable(s.status) && isApproverFor(a, s);
}

/** Which of the sheet's projects this user can PM-approve right now. */
export function pmApprovableProjects(a: Actor, s: SheetAccess, alreadyApproved: string[]): string[] {
  if (s.status !== "SUBMITTED") return [];
  return [...new Set(s.projectIds)].filter((p) => a.pmProjectIds.includes(p) && !alreadyApproved.includes(p));
}

export function canGcApprove(a: Actor, s: SheetAccess): boolean {
  return isGc(a) && s.status === "PM_APPROVED";
}

export function canRejectSheet(a: Actor, s: SheetAccess): boolean {
  return (s.status === "SUBMITTED" || s.status === "PM_APPROVED") && isApproverFor(a, s);
}
