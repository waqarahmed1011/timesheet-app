import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import type { Role } from "@/lib/timesheet/state";

export type CurrentUser = Actor & { name: string; email: string; workerName: string | null };

export async function getActor(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await db.user.findUnique({
    where: { id },
    include: { worker: true, assignments: true, managedProjects: { select: { id: true } } },
  });
  if (!u || !u.active) return null;
  return {
    id: u.id,
    name: u.name ?? u.email,
    email: u.email,
    roles: u.roles as Role[],
    companyId: u.companyId,
    workerId: u.worker?.id ?? null,
    workerName: u.worker?.name ?? null,
    assignedProjectIds: u.assignments.map((a) => a.projectId),
    pmProjectIds: u.managedProjects.map((p) => p.id),
  };
}

export async function requireActor(): Promise<CurrentUser> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const a = await requireActor();
  if (!roles.some((r) => a.roles.includes(r))) redirect("/");
  return a;
}
