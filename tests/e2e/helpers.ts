import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient();
export const WEEK = "2026-10-25"; // a past Sunday-Saturday week, so sheets are late by design
export const MON = "2026-10-26";
export const TUE = "2026-10-27";
export const WED = "2026-10-28";

export async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByTestId("dev-email").selectOption(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function workerId(name: string) {
  return (await db.worker.findFirstOrThrow({ where: { name } })).id;
}

export async function ids() {
  const [p1, p2, exc, con, sup] = await Promise.all([
    db.project.findUniqueOrThrow({ where: { number: "P-101" } }),
    db.project.findUniqueOrThrow({ where: { number: "P-102" } }),
    db.phase.findUniqueOrThrow({ where: { name: "Excavation" } }),
    db.phase.findUniqueOrThrow({ where: { name: "Concrete" } }),
    db.phase.findUniqueOrThrow({ where: { name: "Supervision" } }),
  ]);
  return { p1: p1.id, p2: p2.id, exc: exc.id, con: con.id, sup: sup.id };
}

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return String(h * 60 + m);
};

export async function setTimes(page: Page, date: string, start: string, end: string) {
  await page.getByLabel(`Start ${date}`).selectOption(t(start));
  await page.getByLabel(`End ${date}`).selectOption(t(end));
}

export async function signAndSubmit(page: Page) {
  await page.getByRole("button", { name: "Review and sign" }).click();
  const pad = page.getByTestId("signature-pad");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 20, box.y + 40 + (i % 2 ? 30 : -10));
  await page.mouse.up();
  await page.getByRole("button", { name: "Sign and submit" }).click();
  await expect(page.getByText("Waiting on PM").first()).toBeVisible();
}

export async function sheetStatus(worker: string, week = WEEK) {
  const s = await db.timesheet.findFirstOrThrow({ where: { worker: { name: worker }, weekStart: new Date(`${week}T00:00:00Z`) } });
  return s;
}
