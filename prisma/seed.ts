// Demo data for local development and tests. Placeholder names until the real company data is loaded.
import { PrismaClient, type Role } from "@prisma/client";

const db = new PrismaClient();

async function company(name: string, isOwnCompany: boolean) {
  return (await db.company.findFirst({ where: { name } })) ?? db.company.create({ data: { name, isOwnCompany } });
}

async function user(email: string, name: string, roles: Role[], companyId: string) {
  return db.user.upsert({ where: { email }, update: { name, roles, companyId, active: true }, create: { email, name, roles, companyId } });
}

async function worker(name: string, companyId: string, type: "OWN" | "SUB", userId?: string) {
  const existing = await db.worker.findFirst({ where: { name, companyId } });
  if (existing) return db.worker.update({ where: { id: existing.id }, data: { userId: userId ?? null, type, active: true } });
  return db.worker.create({ data: { name, companyId, type, userId } });
}

async function main() {
  const own = await company(process.env.COMPANY_NAME || "Demo General Contractors", true);
  const sub = await company("ABC Excavating", false);

  const gc = await user("gc@example.com", "Gary Collins", ["ADMIN", "GC"], own.id);
  const pm1 = await user("pm1@example.com", "Paula Martin", ["PM"], own.id);
  const pm2 = await user("pm2@example.com", "Peter Moss", ["PM"], own.id);
  const foreman = await user("foreman@example.com", "Frank Ortiz", ["FOREMAN", "WORKER"], own.id);
  const subForeman = await user("subforeman@example.com", "Sam Abbott", ["FOREMAN", "WORKER"], sub.id);
  const w1 = await user("worker@example.com", "Will Turner", ["WORKER"], own.id);

  await worker("Frank Ortiz", own.id, "OWN", foreman.id);
  await worker("Will Turner", own.id, "OWN", w1.id);
  await worker("Mike Brown", own.id, "OWN");
  await worker("Sam Abbott", sub.id, "SUB", subForeman.id);
  await worker("Luis Garcia", sub.id, "SUB");

  const p1 = await db.project.upsert({
    where: { number: "P-101" },
    update: { pmUserId: pm1.id },
    create: { number: "P-101", name: "Main St Library", address: "100 Main St, Springfield, IL", county: "Sangamon", pmUserId: pm1.id },
  });
  const p2 = await db.project.upsert({
    where: { number: "P-102" },
    update: { pmUserId: pm2.id },
    create: { number: "P-102", name: "Oak Park Retail", address: "200 Oak Ave, Oak Park, IL", county: "Cook", pmUserId: pm2.id },
  });

  for (const [projectId, userId] of [[p1.id, foreman.id], [p2.id, foreman.id], [p1.id, subForeman.id]]) {
    await db.projectAssignment.upsert({ where: { projectId_userId: { projectId, userId } }, update: {}, create: { projectId, userId } });
  }

  const phases = [
    ["Supervision", "01-100"],
    ["Excavation", "31-200"],
    ["Concrete", "03-300"],
    ["Framing", "06-100"],
    ["General Labor", "01-500"],
  ];
  for (const [i, [name, costCode]] of phases.entries()) {
    await db.phase.upsert({ where: { name }, update: {}, create: { name, costCode, sortOrder: i } });
  }
  void gc;
  console.log("Seeded demo data");
}

main().finally(() => db.$disconnect());
