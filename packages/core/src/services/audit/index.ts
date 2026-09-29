import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { auditEvent } from "../../schema.ts";
import type { AuditAction } from "./actions.ts";

export {
  AUDIT_ACTIONS,
  type AuditAction,
  auditActionGroup,
  isOperatorAction,
} from "./actions.ts";

export {
  type AuditActorView,
  type AuditDateRange,
  type AuditEventCursor,
  type AuditEventFilters,
  type AuditEventView,
  type AuditFilterOptions,
  type AuditMetadata,
  type AuditPage,
  type AuditReadInput,
  readAuditPage,
} from "./reader.ts";

export { createAuditRouter, type AuditRouter } from "./router.ts";

/** One json value an audit row's metadata may carry. It is a closed shape, never `unknown`. */
export type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly AuditMetadataValue[]
  | { readonly [name: string]: AuditMetadataValue };

/**
 * One operator audit write, as the command runner hands it over (R-64, DEC-45). The command
 * name reaches the row as `action`, the operating-system user, the allow-listed arguments and
 * the outcome as `metadata`, and the operator's own output is where the row falls back to when
 * the table cannot take it (R-65).
 */
export type AuditEventInput = {
  /** The stable action, `ops:<command>` (R-64). */
  readonly action: string;
  /** The operating-system user, the allow-listed arguments and the outcome (R-66). */
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
  /** Where the outcome goes when a row cannot be written (R-65). */
  readonly output: (line: string) => void;
};

/** One application audit write through the tenant context (R-44). */
export async function writeAuthAuditEvent(
  context: TenantContext,
  input: {
    readonly action:
      | "auth:sign_in"
      | "auth:sign_in_refused"
      | "auth:groups_claim_absent"
      | "auth:rate_limited"
      | "auth:break_glass_sign_in"
      | "auth:break_glass_password_changed"
      | "auth:break_glass_authenticator_enrolled"
      | "auth:break_glass_authenticator_cleared";
    readonly actorUserId?: string | null;
    readonly targetUserId?: string | null;
    readonly summary: string;
    readonly metadata?: Readonly<Record<string, AuditMetadataValue>>;
  }
): Promise<void> {
  await context.db.insert(auditEvent).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    targetType: "user",
    targetId: input.targetUserId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
}

/**
 * One administration audit write through the tenant context (R-44, R-45). It takes the caller's
 * own transaction, so the row commits or rolls back with the write it records, and its `action`
 * is typed against the R-45 catalogue: a write can never record an action the reader's fixed
 * filter cannot offer (AC-10).
 */
export type AdminAuditInput = {
  readonly action: AuditAction;
  /** The acting administrator, or null for a system write. */
  readonly actorUserId: string | null;
  readonly targetType?: string;
  readonly targetId?: string | null;
  readonly summary: string;
  readonly metadata?: Readonly<Record<string, AuditMetadataValue>>;
};

export async function writeAdminAuditEvent(
  tx: TenantTransaction,
  input: AdminAuditInput
): Promise<void> {
  await tx.insert(auditEvent).values({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
}

/**
 * The Postgres error code of a failed write, or `undefined` for anything else. drizzle-orm
 * 0.45.2 wraps a failed query in `DrizzleQueryError`, which carries no `code` of its own; the
 * driver's pg error, and its `code`, sits on `.cause`. So the chain is walked, not just the top
 * error. Only the code reaches the fallback line: the message and every value (drizzle's
 * wrapper message holds the SQL and the parameters) stay in the server log (R-45, R-66).
 */
function pgErrorCode(error: Error | undefined): string | undefined {
  for (let current = error; current !== undefined;) {
    if ("code" in current) {
      const code: unknown = current.code;

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of a driver error
      if (typeof code === "string") return code;
    }

    current = current.cause instanceof Error ? current.cause : undefined;
  }

  return undefined;
}

/**
 * The one place a `genie-ops` command touches `audit_event` (R-64, DEC-45). It writes one
 * append-only row with `actor_user_id` null, the action the runner named, and the metadata the
 * runner allow-listed; the summary is the action, because an operator row carries no target. The
 * insert is the typed one from `schema.ts`, so a renamed or dropped column fails `tsc` here.
 *
 * A row that cannot be written — the database or the table does not exist yet, or the write
 * would outlive the database — is not a second failure. The helper reports the outcome on the
 * command output instead, with the driver's error code and nothing else, so an operator still
 * sees it (R-65) and the reason is not silent; the command's own exit decides the run.
 *
 * It takes the tenant context, never a pool (DEC-34): the one context owns the one connection,
 * and a command never builds its own.
 */
export async function writeAuditEvent(
  context: TenantContext,
  input: AuditEventInput
): Promise<void> {
  try {
    await context.db.insert(auditEvent).values({
      actorUserId: null,
      action: input.action,
      summary: input.action,
      metadata: input.metadata,
    });
  } catch (caught) {
    // R-65: the command output is the fallback sink. Nothing is rethrown, because the command's
    // own result, not the audit transport, decides whether it succeeded.
    const code = pgErrorCode(caught instanceof Error ? caught : undefined);

    input.output(
      `audit ${input.action}: ${JSON.stringify(input.metadata)} (not recorded${
        code === undefined ? "" : `: ${code}`
      })`
    );
  }
}
