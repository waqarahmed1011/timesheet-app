// Timesheet status rules. Pure functions so they can be unit tested.

export type Status = "DRAFT" | "SUBMITTED" | "PM_APPROVED" | "LOCKED" | "REJECTED" | "VOID";
export type Role = "ADMIN" | "GC" | "PM" | "FOREMAN" | "WORKER";

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting on PM",
  PM_APPROVED: "Waiting on GC",
  LOCKED: "Approved (locked)",
  REJECTED: "Sent back",
  VOID: "Void",
};

/** Submitter (worker or foreman) can change the sheet. */
export function isSubmitterEditable(status: Status): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

/** Approvers can edit inline (with a reason) while it's in review. */
export function isApproverEditable(status: Status): boolean {
  return status === "SUBMITTED" || status === "PM_APPROVED";
}

export function canSubmitFrom(status: Status): boolean {
  return isSubmitterEditable(status);
}

/**
 * After a PM approves their project, the sheet moves to PM_APPROVED only when
 * every project on the sheet has a PM approval in the current cycle.
 */
export function statusAfterPmApproval(sheetProjectIds: string[], approvedProjectIds: string[]): Status {
  const approved = new Set(approvedProjectIds);
  return sheetProjectIds.every((p) => approved.has(p)) ? "PM_APPROVED" : "SUBMITTED";
}

export function pendingPmProjects(sheetProjectIds: string[], approvedProjectIds: string[]): string[] {
  const approved = new Set(approvedProjectIds);
  return [...new Set(sheetProjectIds)].filter((p) => !approved.has(p));
}

/** Any approver edit sends the sheet back to the start of review, with a fresh approval cycle. */
export const STATUS_AFTER_EDIT: Status = "SUBMITTED";

export function canGcApprove(status: Status): boolean {
  return status === "PM_APPROVED";
}

export function canReject(status: Status): boolean {
  return status === "SUBMITTED" || status === "PM_APPROVED";
}

export function canReopen(status: Status): boolean {
  return status === "LOCKED";
}

export function canVoid(status: Status): boolean {
  return status !== "LOCKED" && status !== "VOID";
}
