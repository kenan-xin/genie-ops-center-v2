import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  PermissionChange,
  PermissionTransformation,
} from "../../lib/module-contract/module.ts";
import { auditEvent, role } from "../../schema.ts";
import type { AuditAction } from "../audit/actions.ts";

/**
 * The audit action of one applied transformation; the row is also its ledger entry. Typed against
 * the R-45 catalogue, so a rename of the catalogue entry fails `tsc` here rather than silently
 * writing an action the reader's fixed filter cannot offer.
 */
export const PERMISSION_TRANSFORMATION_ACTION: AuditAction =
  "core:permission_transformation";

/** Core's own transformations of its `core:` keys. None has shipped yet. */
export const CORE_PERMISSION_TRANSFORMATIONS: readonly PermissionTransformation[] =
  [];

/** One history's transformations, named by the history that owns the keys. */
export type TransformationSource = {
  readonly name: string;
  readonly permissionTransformations?: readonly PermissionTransformation[];
};

type KeyChange = Exclude<PermissionChange, { kind: "rename-role" }>;

function transformed(before: readonly string[], change: KeyChange): string[] {
  if (change.kind === "revoke") {
    return before.filter((key) => key !== change.key);
  }

  return [
    ...new Set(before.map((key) => (key === change.from ? change.to : key))),
  ];
}

function affectedKey(change: KeyChange): string {
  return change.kind === "revoke" ? change.key : change.from;
}

/** One role a transformation touched, as its audit row records it. */
type TouchedRole = {
  readonly id: string;
  readonly before: readonly string[] | string;
  readonly after: readonly string[] | string;
};

/**
 * Applies one change and answers the roles it touched. A key change rewrites that key in every
 * role holding it; a role rename touches only the owner's own system role of that name.
 */
async function applyChange(
  tx: Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0],
  history: string,
  change: PermissionChange
): Promise<readonly TouchedRole[]> {
  if (change.kind === "rename-role") {
    const renamed = await tx
      .update(role)
      .set({ name: change.to, updatedAt: sql`now()` })
      .where(
        and(
          eq(role.name, change.from),
          eq(role.isSystem, true),
          history === "core"
            ? isNull(role.moduleId)
            : eq(role.moduleId, history)
        )
      )
      .returning({ id: role.id });

    return renamed.map(({ id }) => ({
      id,
      before: change.from,
      after: change.to,
    }));
  }

  const holders = await tx
    .select({ id: role.id, permissions: role.permissions })
    .from(role)
    .where(sql`${affectedKey(change)} = any(${role.permissions})`)
    .for("update");

  const touched = holders.map((holder) => ({
    id: holder.id,
    before: holder.permissions,
    after: transformed(holder.permissions, change),
  }));

  for (const entry of touched) {
    // One statement at a time on the one transaction.
    // oxlint-disable-next-line no-await-in-loop
    await tx
      .update(role)
      .set({ permissions: entry.after, updatedAt: sql`now()` })
      .where(eq(role.id, entry.id));
  }

  return touched;
}

/**
 * Applies every declared transformation not yet recorded, in declaration order, in one
 * transaction on the migrator's locked session (R-33c). Each rewrites only the one key in every
 * role that holds it, system and custom alike, and keeps role ids, assignments, scopes and
 * memberships. Its `audit_event` row, with the before and after arrays and no human actor, is
 * written in the same transaction and is what makes a rerun skip it. A failure rolls every
 * transformation of the run back and fails the run, so the process never becomes ready.
 */
export async function applyPermissionTransformations(
  db: NodePgDatabase,
  sources: readonly TransformationSource[]
): Promise<void> {
  const declared = sources.flatMap((source) =>
    (source.permissionTransformations ?? []).map((transformation) => ({
      ledger: `${source.name}/${transformation.id}`,
      history: source.name,
      transformation,
    }))
  );

  if (declared.length === 0) return;

  await db.transaction(async (tx) => {
    for (const { ledger, history, transformation } of declared) {
      // Each step reads what the one before it wrote, on the one transaction.
      // oxlint-disable-next-line no-await-in-loop
      const done = await tx
        .select({ id: auditEvent.id })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.action, PERMISSION_TRANSFORMATION_ACTION),
            sql`${auditEvent.metadata}->>'transformation' = ${ledger}`
          )
        )
        .limit(1);

      if (done.length > 0) continue;

      const { change } = transformation;

      // oxlint-disable-next-line no-await-in-loop
      const roles = await applyChange(tx, history, change);

      // oxlint-disable-next-line no-await-in-loop
      await tx.insert(auditEvent).values({
        actorUserId: null,
        action: PERMISSION_TRANSFORMATION_ACTION,
        targetType: change.kind === "rename-role" ? "role" : "permission",
        targetId:
          change.kind === "rename-role" ? change.from : affectedKey(change),
        summary: transformation.description,
        metadata: {
          transformation: ledger,
          history,
          release: transformation.release,
          change,
          roles,
        },
      });
    }
  });
}
