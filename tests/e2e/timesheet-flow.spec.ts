import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import pdf from "pdf-parse";
import { db, ids, login, MON, sheetStatus, signAndSubmit, setTimes, TUE, WED, WEEK, workerId } from "./helpers";

test.describe.configure({ mode: "serial" });

test("worker fills a week across two projects, signs and submits", async ({ page }) => {
  const w = await workerId("Will Turner");
  const id = await ids();
  await login(page, "worker@example.com");
  await expect(page.getByRole("heading", { name: "My timesheets" })).toBeVisible();
  await page.goto(`/sheet/${w}/${WEEK}`);

  // Monday 7:00-3:30, 30 min lunch auto-deducted = 8h, split across two projects
  await setTimes(page, MON, "07:00", "15:30");
  await expect(page.getByTestId(`day-${MON}`)).toContainText("Paid: 8h");
  await expect(page.getByTestId(`day-${MON}`)).toContainText("30 min lunch taken off");
  await page.getByLabel(`Project ${MON} row 1`).selectOption(id.p1);
  await page.getByLabel(`Phase ${MON} row 1`).selectOption(id.exc);
  await page.getByLabel(`Hours ${MON} row 1`).fill("4");
  await page.getByTestId(`day-${MON}`).getByText("+ Add project / phase").click();
  await page.getByLabel(`Project ${MON} row 2`).selectOption(id.p2);
  await page.getByLabel(`Phase ${MON} row 2`).selectOption(id.con);
  await page.getByLabel(`Hours ${MON} row 2`).fill("4");

  // Tuesday: no lunch taken, 7:00-3:30 = 8.5h on one project
  await setTimes(page, TUE, "07:00", "15:30");
  await page.getByLabel(`No lunch ${TUE}`).check();
  await page.getByLabel(`Project ${TUE} row 1`).selectOption(id.p1);
  await page.getByLabel(`Phase ${TUE} row 1`).selectOption(id.sup);
  await expect(page.getByTestId(`day-${TUE}`)).toContainText("Paid: 8.5h");

  // Mismatched rows block submission
  await page.getByLabel(`Hours ${MON} row 2`).fill("3");
  await expect(page.getByTestId(`day-${MON}`)).toContainText("must add up");
  await page.getByLabel(`Hours ${MON} row 2`).fill("4");

  await expect(page.getByTestId("week-total")).toHaveText("16.5h");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toHaveText("Draft saved");

  await signAndSubmit(page);
  await expect(page.getByText("Late").first()).toBeVisible();
  const s = await sheetStatus("Will Turner");
  expect(s.status).toBe("SUBMITTED");
  expect(s.totalMinutes).toBe(990);
  expect(s.signatureImage).toMatch(/^data:image\/png;base64,/);

  // Worker can no longer edit
  await page.reload();
  await expect(page.getByRole("button", { name: "Review and sign" })).toHaveCount(0);
});

test("each project's PM approves, then GC approves and the sheet locks", async ({ page }) => {
  const w = await workerId("Will Turner");

  await login(page, "pm1@example.com");
  await page.goto("/approvals");
  await expect(page.getByText("Waiting on you (1)")).toBeVisible();
  await page.getByTestId("approval-row").first().click();
  await expect(page.getByText("PM approval: P-101 Main St Library")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Approved");
  expect((await sheetStatus("Will Turner")).status).toBe("SUBMITTED"); // still waiting on P-102's PM

  await login(page, "pm2@example.com");
  await page.goto(`/sheet/${w}/${WEEK}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Waiting on GC").first()).toBeVisible();

  await login(page, "gc@example.com");
  await page.goto("/approvals");
  await page.getByTestId("approval-row").first().click();
  await page.getByRole("button", { name: "Final approve and lock" }).click();
  await expect(page.getByText("Approved (locked)").first()).toBeVisible();
  expect((await sheetStatus("Will Turner")).status).toBe("LOCKED");

  // Worker sees it locked, no editing
  await login(page, "worker@example.com");
  await page.goto(`/sheet/${w}/${WEEK}`);
  await expect(page.getByText("Approved (locked)").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and sign" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
});

test("admin reopens, PM sends it back, worker fixes and resubmits", async ({ page }) => {
  const w = await workerId("Will Turner");
  await login(page, "gc@example.com");
  await page.goto(`/sheet/${w}/${WEEK}`);
  await page.getByLabel("Review comment").fill("Wrong phase on Tuesday");
  await page.getByRole("button", { name: /Reopen/ }).click();
  await expect(page.getByText("Waiting on PM").first()).toBeVisible();
  const reopened = await sheetStatus("Will Turner");
  expect(reopened.status).toBe("SUBMITTED");
  expect(reopened.cycle).toBe(2);

  await login(page, "pm1@example.com");
  await page.goto(`/sheet/${w}/${WEEK}`);
  await page.getByLabel("Review comment").fill("Tuesday should be Excavation, not Supervision");
  await page.getByRole("button", { name: "Send back" }).click();
  await expect(page.getByText("Sent back").first()).toBeVisible();

  await login(page, "worker@example.com");
  await expect(page.getByText("Sent back: Tuesday should be Excavation")).toBeVisible();
  await page.goto(`/sheet/${w}/${WEEK}`);
  const id = await ids();
  await page.getByLabel(`Phase ${TUE} row 1`).selectOption(id.exc);
  await signAndSubmit(page);
  expect((await sheetStatus("Will Turner")).status).toBe("SUBMITTED");
});

test("PM edits hours inline with a reason and it lands in the change log", async ({ page }) => {
  const w = await workerId("Will Turner");
  await login(page, "pm1@example.com");
  await page.goto(`/sheet/${w}/${WEEK}`);
  await page.getByRole("button", { name: "Edit hours" }).click();
  // Tuesday left at 2:30, so 7:00-2:30 = 7.5h span, no lunch checked => 7.5h
  await page.getByLabel(`End ${TUE}`).selectOption(String(14 * 60 + 30));
  await expect(page.getByTestId(`day-${TUE}`)).toContainText("Paid: 7.5h");
  await page.getByLabel("Edit reason").fill("Left early Tuesday per super");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited by approver")).toBeVisible();

  const s = await sheetStatus("Will Turner");
  expect(s.totalMinutes).toBe(930);
  const log = await db.auditLog.findFirstOrThrow({ where: { entityId: s.id, action: "approver_edit" } });
  expect(log.reason).toBe("Left early Tuesday per super");
  expect(JSON.stringify(log.changes)).toContain("3:30 PM");
  expect(JSON.stringify(log.changes)).toContain("2:30 PM");

  await page.getByText(/Change log/).click();
  await expect(page.getByText("Reason: Left early Tuesday per super")).toBeVisible();
});

test("foreman submits a crew sheet for a worker with no login", async ({ page }) => {
  const id = await ids();
  await login(page, "foreman@example.com");
  await page.goto(`/crew?week=${WEEK}`);
  await page.getByRole("listitem").filter({ hasText: "Mike Brown" }).getByRole("link", { name: "Open" }).click();
  await setTimes(page, WED, "06:00", "14:30");
  await page.getByLabel(`Project ${WED} row 1`).selectOption(id.p2);
  await page.getByLabel(`Phase ${WED} row 1`).selectOption(id.con);
  await expect(page.getByText(/as foreman/)).toHaveCount(0);
  await page.getByRole("button", { name: "Review and sign" }).click();
  await expect(page.getByText(/as foreman/)).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await signAndSubmit(page);
  const s = await db.timesheet.findFirstOrThrow({ where: { worker: { name: "Mike Brown" } }, include: { submittedBy: true } });
  expect(s.status).toBe("SUBMITTED");
  expect(s.submittedBy?.email).toBe("foreman@example.com");

  // Sub foreman can't open another company's worker
  await login(page, "subforeman@example.com");
  const res = await page.goto(`/sheet/${await workerId("Mike Brown")}/${WEEK}`);
  expect(res?.status()).toBe(404);
});

test("downloads: sheet PDF and weekly Excel match the database", async ({ page }) => {
  await login(page, "gc@example.com");
  const s = await sheetStatus("Will Turner");

  const pdfRes = await page.request.get(`/api/export/sheet/${s.id}`);
  expect(pdfRes.status()).toBe(200);
  const text = (await pdf(await pdfRes.body())).text;
  expect(text).toContain("Will Turner");
  expect(text).toContain("15.5");
  expect(text).toContain("Weekly Timesheet");

  const xRes = await page.request.get(`/api/export/week/${WEEK}`);
  expect(xRes.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await xRes.body()) as never);
  const sum = wb.getWorksheet("Summary")!;
  const will = sum.getRows(1, sum.rowCount)!.find((r) => r.getCell(1).value === "Will Turner")!;
  expect(will.getCell(5).value).toBe(15.5);
  const detail = wb.getWorksheet("Detail")!;
  const hours = detail.getRows(2, detail.rowCount - 1)!.filter((r) => r.getCell(1).value === "Will Turner").reduce((t, r) => t + Number(r.getCell(13).value), 0);
  expect(hours).toBe(15.5);

  const zRes = await page.request.get(`/api/export/week/${WEEK}?format=zip`);
  expect(zRes.headers()["content-type"]).toBe("application/zip");
  expect(await db.exportFile.count()).toBe(3);

  // Workers can't pull the weekly export
  await login(page, "worker@example.com");
  expect((await page.request.get(`/api/export/week/${WEEK}`)).status()).toBe(403);
});

test("dashboard shows counts and missing sheets", async ({ page }) => {
  await login(page, "gc@example.com");
  await page.goto(`/admin?week=${WEEK}`);
  await expect(page.getByTestId("tile-Expected")).toHaveText("5");
  await expect(page.getByTestId("tile-Submitted")).toHaveText("2");
  await expect(page.getByText("Missing or not submitted (3)")).toBeVisible();
  await expect(page.getByText("Paula Martin (PM, P-101)")).toBeVisible();
});

test.afterAll(async () => {
  await db.$disconnect();
});
