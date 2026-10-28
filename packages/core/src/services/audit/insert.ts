import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { auditEvent } from "../../schema.ts";
import type { AuditMetadataValue } from "./index.ts";

/** One `audit_event` row as a writer describes it, before the column defaults are applied. */
export type AuditRow = {
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType?: string | null | undefined;
  readonly targetId?: string | null | undefined;
  readonly summary: string;
  readonly metadata?: Readonly<Record<string, AuditMetadataValue>> | undefined;
};

/**
 * The one insert every audit writer in this folder shares. It writes through the database or the
 * caller's own transaction, so a module row commits or rolls back with the write it records, and
 * the typed schema insert fails `tsc` if a column is renamed or dropped.
 */
export async function insertAuditRow(
  db: TenantContext["db"] | TenantTransaction,
  row: AuditRow
): Promise<void> {
  await db.insert(auditEvent).values({
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    summary: row.summary,
    metadata: row.metadata ?? {},
  });
}
