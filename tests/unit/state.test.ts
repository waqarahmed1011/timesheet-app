import { describe, expect, it } from "vitest";
import { canGcApprove, canReject, canReopen, isApproverEditable, isSubmitterEditable, pendingPmProjects, statusAfterPmApproval } from "@/lib/timesheet/state";
import { canEditAsApprover, canEditAsSubmitter, canView, pmApprovableProjects, type Actor, type SheetAccess } from "@/lib/permissions";

describe("status rules", () => {
  it("submitter can only edit draft or sent-back sheets", () => {
    expect(isSubmitterEditable("DRAFT")).toBe(true);
    expect(isSubmitterEditable("REJECTED")).toBe(true);
    expect(isSubmitterEditable("SUBMITTED")).toBe(false);
    expect(isSubmitterEditable("LOCKED")).toBe(false);
  });

  it("approvers can edit only while in review", () => {
    expect(isApproverEditable("SUBMITTED")).toBe(true);
    expect(isApproverEditable("PM_APPROVED")).toBe(true);
    expect(isApproverEditable("LOCKED")).toBe(false);
  });

  it("needs every project's PM before going to GC", () => {
    expect(statusAfterPmApproval(["a", "b"], ["a"])).toBe("SUBMITTED");
    expect(statusAfterPmApproval(["a", "b"], ["a", "b"])).toBe("PM_APPROVED");
    expect(pendingPmProjects(["a", "b", "a"], ["a"])).toEqual(["b"]);
  });

  it("GC approves only after PM, reopen only when locked", () => {
    expect(canGcApprove("SUBMITTED")).toBe(false);
    expect(canGcApprove("PM_APPROVED")).toBe(true);
    expect(canReopen("PM_APPROVED")).toBe(false);
    expect(canReopen("LOCKED")).toBe(true);
    expect(canReject("LOCKED")).toBe(false);
  });
});

const actor = (o: Partial<Actor>): Actor => ({ id: "u", roles: [], companyId: null, workerId: null, assignedProjectIds: [], pmProjectIds: [], ...o });
const sheet = (o: Partial<SheetAccess>): SheetAccess => ({ workerId: "w1", workerCompanyId: "subA", status: "DRAFT", projectIds: ["p1"], ...o });

describe("permissions", () => {
  it("worker sees and edits only their own sheet", () => {
    const w = actor({ roles: ["WORKER"], workerId: "w1", companyId: "subA" });
    expect(canView(w, sheet({}))).toBe(true);
    expect(canEditAsSubmitter(w, sheet({}))).toBe(true);
    expect(canView(w, sheet({ workerId: "w2" }))).toBe(false);
  });

  it("worker cannot edit after submitting", () => {
    const w = actor({ roles: ["WORKER"], workerId: "w1" });
    expect(canEditAsSubmitter(w, sheet({ status: "SUBMITTED" }))).toBe(false);
  });

  it("foreman can submit for own company crew, not another sub's", () => {
    const f = actor({ roles: ["FOREMAN"], companyId: "subA" });
    expect(canEditAsSubmitter(f, sheet({}))).toBe(true);
    expect(canEditAsSubmitter(f, sheet({ workerCompanyId: "subB" }))).toBe(false);
  });

  it("foreman sees other companies' sheets on assigned projects only", () => {
    const f = actor({ roles: ["FOREMAN"], companyId: "subA", assignedProjectIds: ["p1"] });
    expect(canView(f, sheet({ workerCompanyId: "subB", projectIds: ["p1"] }))).toBe(true);
    expect(canView(f, sheet({ workerCompanyId: "subB", projectIds: ["p2"] }))).toBe(false);
  });

  it("PM approves only their own project and only once per cycle", () => {
    const pm = actor({ roles: ["PM"], pmProjectIds: ["p1"] });
    const s = sheet({ status: "SUBMITTED", projectIds: ["p1", "p2"] });
    expect(pmApprovableProjects(pm, s, [])).toEqual(["p1"]);
    expect(pmApprovableProjects(pm, s, ["p1"])).toEqual([]);
    expect(canEditAsApprover(pm, s)).toBe(true);
    expect(canEditAsApprover(pm, sheet({ status: "SUBMITTED", projectIds: ["p3"] }))).toBe(false);
  });
});
