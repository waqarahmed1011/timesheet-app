"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/server/actor";
import { audit, diff } from "@/server/audit";

const ROLES: Role[] = ["ADMIN", "GC", "PM", "FOREMAN", "WORKER"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const bool = (fd: FormData, k: string) => fd.get(k) === "on";

function back(path: string, error?: string): never {
  revalidatePath("/", "layout");
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : `${path}?saved=1`);
}

function friendly(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "That already exists (duplicate name, email or number)";
  if (e instanceof Error && e.message.startsWith("!")) return e.message.slice(1);
  console.error(e);
  return "Couldn't save";
}

/** Generic create/update with an audit row. `pick` maps a record to the audited fields. */
async function save<T extends Record<string, unknown>>(
  entity: string,
  path: string,
  id: string | null,
  data: T,
  ops: {
    find: (id: string) => Promise<T | null>;
    create: (tx: Prisma.TransactionClient, d: T) => Promise<{ id: string }>;
    update: (tx: Prisma.TransactionClient, id: string, d: T) => Promise<unknown>;
  },
) {
  const me = await requireRole("ADMIN");
  try {
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await ops.find(id);
        if (!before) throw new Error("!Not found");
        const changes = diff(before, data);
        if (!changes.length) return;
        await ops.update(tx, id, data);
        await audit(tx, { entity, entityId: id, action: "update", actorId: me.id, changes });
      } else {
        const created = await ops.create(tx, data);
        await audit(tx, { entity, entityId: created.id, action: "create", actorId: me.id, changes: diff({}, data) });
      }
    });
  } catch (e) {
    back(path, friendly(e));
  }
  back(path);
}

export async function saveCompany(fd: FormData) {
  const data = { name: str(fd, "name"), isOwnCompany: bool(fd, "isOwnCompany"), active: bool(fd, "active") };
  if (!data.name) back("/admin/setup/companies", "Name is required");
  await save("Company", "/admin/setup/companies", opt(fd, "id"), data, {
    find: (id) => db.company.findUnique({ where: { id }, select: { name: true, isOwnCompany: true, active: true } }),
    create: (tx, d) => tx.company.create({ data: d }),
    update: (tx, id, d) => tx.company.update({ where: { id }, data: d }),
  });
}

export async function saveUser(fd: FormData) {
  const roles = ROLES.filter((r) => fd.getAll("roles").includes(r));
  const data = {
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    roles,
    companyId: opt(fd, "companyId"),
    active: bool(fd, "active"),
  };
  if (!data.name || !/^\S+@\S+\.\S+$/.test(data.email)) back("/admin/setup/users", "Name and a valid email are required");
  await save("User", "/admin/setup/users", opt(fd, "id"), data, {
    find: (id) => db.user.findUnique({ where: { id }, select: { name: true, email: true, roles: true, companyId: true, active: true } }) as never,
    create: (tx, d) => tx.user.create({ data: d }),
    update: (tx, id, d) => tx.user.update({ where: { id }, data: d }),
  });
}

export async function saveWorker(fd: FormData) {
  const data = {
    name: str(fd, "name"),
    companyId: str(fd, "companyId"),
    type: (str(fd, "type") === "SUB" ? "SUB" : "OWN") as "OWN" | "SUB",
    userId: opt(fd, "userId"),
    classification: opt(fd, "classification"),
    active: bool(fd, "active"),
  };
  if (!data.name || !data.companyId) back("/admin/setup/workers", "Name and company are required");
  await save("Worker", "/admin/setup/workers", opt(fd, "id"), data, {
    find: (id) => db.worker.findUnique({ where: { id }, select: { name: true, companyId: true, type: true, userId: true, classification: true, active: true } }),
    create: (tx, d) => tx.worker.create({ data: d }),
    update: (tx, id, d) => tx.worker.update({ where: { id }, data: d }),
  });
}

export async function saveProject(fd: FormData) {
  const types = ["PRIVATE", "IL_PREVAILING_WAGE", "FEDERAL_DAVIS_BACON"] as const;
  const t = str(fd, "type");
  const data = {
    number: str(fd, "number"),
    name: str(fd, "name"),
    address: opt(fd, "address"),
    county: opt(fd, "county"),
    type: (types as readonly string[]).includes(t) ? (t as (typeof types)[number]) : "PRIVATE",
    pmUserId: opt(fd, "pmUserId"),
    active: bool(fd, "active"),
    foremen: fd.getAll("foremen").map(String).sort(),
  };
  if (!data.number || !data.name) back("/admin/setup/projects", "Project number and name are required");
  const { foremen, ...fields } = data;
  const setForemen = async (tx: Prisma.TransactionClient, projectId: string) => {
    await tx.projectAssignment.deleteMany({ where: { projectId, userId: { notIn: foremen } } });
    for (const userId of foremen) {
      await tx.projectAssignment.upsert({ where: { projectId_userId: { projectId, userId } }, update: {}, create: { projectId, userId } });
    }
  };
  await save("Project", "/admin/setup/projects", opt(fd, "id"), data, {
    find: async (id) => {
      const p = await db.project.findUnique({ where: { id }, include: { assignments: true } });
      if (!p) return null;
      return { number: p.number, name: p.name, address: p.address, county: p.county, type: p.type, pmUserId: p.pmUserId, active: p.active, foremen: p.assignments.map((a) => a.userId).sort() };
    },
    create: async (tx) => {
      const p = await tx.project.create({ data: fields });
      await setForemen(tx, p.id);
      return p;
    },
    update: async (tx, id) => {
      await tx.project.update({ where: { id }, data: fields });
      await setForemen(tx, id);
    },
  });
}

export async function savePhase(fd: FormData) {
  const data = { name: str(fd, "name"), costCode: opt(fd, "costCode"), sortOrder: Number(str(fd, "sortOrder") || 0), active: bool(fd, "active") };
  if (!data.name) back("/admin/setup/phases", "Name is required");
  await save("Phase", "/admin/setup/phases", opt(fd, "id"), data, {
    find: (id) => db.phase.findUnique({ where: { id }, select: { name: true, costCode: true, sortOrder: true, active: true } }),
    create: (tx, d) => tx.phase.create({ data: d }),
    update: (tx, id, d) => tx.phase.update({ where: { id }, data: d }),
  });
}
