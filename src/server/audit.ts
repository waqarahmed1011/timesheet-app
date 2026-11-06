import "server-only";
import type { Prisma } from "@prisma/client";

export type Change = { field: string; old: unknown; new: unknown };

/** Write an audit row inside the same transaction as the change it describes. */
export async function audit(
  tx: Prisma.TransactionClient,
  a: { entity: string; entityId: string; action: string; actorId: string | null; changes?: Change[]; reason?: string | null },
) {
  await tx.auditLog.create({
    data: {
      entity: a.entity,
      entityId: a.entityId,
      action: a.action,
      actorId: a.actorId,
      reason: a.reason ?? null,
      changes: (a.changes ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Field-by-field diff of two flat objects, for admin setup edits. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Change[] = [];
  for (const k of keys) {
    const o = before[k] ?? null;
    const n = after[k] ?? null;
    if (JSON.stringify(o) !== JSON.stringify(n)) out.push({ field: k, old: o, new: n });
  }
  return out;
}
