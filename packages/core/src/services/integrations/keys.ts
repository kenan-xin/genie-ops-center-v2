import { eq, sql } from "drizzle-orm";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { tenantIntegrationKey } from "../../schema.ts";
import { writeAdminAuditEvent } from "../audit/index.ts";

/** Every key core stores, by name, with the words its audit summary uses. */
export const INTEGRATION_KEYS = {
  "model-provider": "model provider key",
} as const;

export type IntegrationKeyName = keyof typeof INTEGRATION_KEYS;

/** One failure as the driver reports it: a Postgres code and, when the server names one, a constraint. */
type PostgresFailure = {
  readonly code: string;
  readonly constraint: string | undefined;
};

/**
 * The driver's code and constraint from a drizzle-wrapped failure. A `DrizzleQueryError` carries
 * the pg `DatabaseError` as its cause, and the wrapper's own message and `.params` hold every
 * query parameter, so only the cause's two fields are read (DEC-53, R-17).
 */
function postgresFailure(
  error: Error | undefined
): PostgresFailure | undefined {
  let current = error instanceof Error ? error : undefined;

  while (current !== undefined) {
    if ("code" in current) {
      const code: unknown = current.code;

      const constraint =
        "constraint" in current ? current.constraint : undefined;

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of a driver error
      if (typeof code === "string") {
        return {
          code,
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of a driver error
          constraint: typeof constraint === "string" ? constraint : undefined,
        };
      }
    }

    current = current.cause instanceof Error ? current.cause : undefined;
  }

  return undefined;
}

/**
 * A new error naming the action, the code and the constraint, and nothing else. The original
 * error is not kept as a cause: its message and parameters carry the key (DEC-53, R-17).
 */
function failureMessage(
  verb: "stored" | "removed",
  name: IntegrationKeyName,
  error: Error | undefined
): string {
  const failure = postgresFailure(error);

  const detail =
    failure === undefined
      ? ""
      : failure.constraint === undefined
        ? ` (Postgres ${failure.code})`
        : ` (Postgres ${failure.code} on ${failure.constraint})`;

  return `The ${INTEGRATION_KEYS[name]} could not be ${verb}${detail}.`;
}

/**
 * Stores one key, replacing the stored value. The row is locked first, so two writers of the same
 * name serialize, and the one audit row says whether it was stored or replaced, never the value
 * (DEC-53).
 */
export async function storeIntegrationKey(
  tenant: TenantContext,
  input: {
    readonly name: IntegrationKeyName;
    readonly value: string;
    readonly actorUserId: string;
  }
): Promise<void> {
  try {
    await withTransaction(tenant, async (tx: TenantTransaction) => {
      const [existing] = await tx
        .select({ id: tenantIntegrationKey.id })
        .from(tenantIntegrationKey)
        .where(eq(tenantIntegrationKey.name, input.name))
        .for("update");

      const replaced = existing !== undefined;

      if (existing === undefined) {
        await tx.insert(tenantIntegrationKey).values({
          name: input.name,
          value: input.value,
          updatedByUserId: input.actorUserId,
        });
      } else {
        await tx
          .update(tenantIntegrationKey)
          .set({
            value: input.value,
            updatedByUserId: input.actorUserId,
            updatedAt: sql`now()`,
          })
          .where(eq(tenantIntegrationKey.id, existing.id));
      }

      await writeAdminAuditEvent(tx, {
        action: "core:integration_key_stored",
        actorUserId: input.actorUserId,
        targetType: "integration_key",
        targetId: input.name,
        summary: `${replaced ? "Replaced" : "Stored"} the ${INTEGRATION_KEYS[input.name]}`,
        metadata: { name: input.name, replaced },
      });
    });
  } catch (error) {
    // oxlint-disable-next-line preserve-caught-error -- DEC-53: a cause carries the key in its message and params
    throw new Error(
      failureMessage(
        "stored",
        input.name,
        error instanceof Error ? error : undefined
      )
    );
  }
}

/** Removes one key. Only a removed row is an audit event (DEC-53). */
export async function removeIntegrationKey(
  tenant: TenantContext,
  input: {
    readonly name: IntegrationKeyName;
    readonly actorUserId: string;
  }
): Promise<{ readonly changed: boolean }> {
  try {
    return await withTransaction(tenant, async (tx: TenantTransaction) => {
      const removed = await tx
        .delete(tenantIntegrationKey)
        .where(eq(tenantIntegrationKey.name, input.name))
        .returning({ id: tenantIntegrationKey.id });

      if (removed.length === 0) return { changed: false };

      await writeAdminAuditEvent(tx, {
        action: "core:integration_key_removed",
        actorUserId: input.actorUserId,
        targetType: "integration_key",
        targetId: input.name,
        summary: `Removed the ${INTEGRATION_KEYS[input.name]}`,
        metadata: { name: input.name },
      });

      return { changed: true };
    });
  } catch (error) {
    // oxlint-disable-next-line preserve-caught-error -- DEC-53: a cause carries the key in its message and params
    throw new Error(
      failureMessage(
        "removed",
        input.name,
        error instanceof Error ? error : undefined
      )
    );
  }
}

/** Whether a key is stored. It answers a boolean and never the value, so a settings read can show it. */
export async function integrationKeyStored(
  tenant: Pick<TenantContext, "db">,
  name: IntegrationKeyName
): Promise<boolean> {
  const [row] = await tenant.db
    .select({ id: tenantIntegrationKey.id })
    .from(tenantIntegrationKey)
    .where(eq(tenantIntegrationKey.name, name));

  return row !== undefined;
}

/** The stored key, for the one model function that sends it. Nothing else may call this (DEC-53). */
export async function readIntegrationKey(
  tenant: Pick<TenantContext, "db">,
  name: IntegrationKeyName
): Promise<string | undefined> {
  const [row] = await tenant.db
    .select({ value: tenantIntegrationKey.value })
    .from(tenantIntegrationKey)
    .where(eq(tenantIntegrationKey.name, name));

  return row?.value;
}
