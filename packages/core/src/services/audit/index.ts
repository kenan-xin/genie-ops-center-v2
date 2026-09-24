import type { TenantContext } from "../../lib/tenant-context/index.ts";

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

/**
 * The one place a `genie-ops` command touches `audit_event` (R-64, DEC-45). It writes one
 * append-only row with `actor_user_id` null, the action the runner named, and the metadata the
 * runner allow-listed; the summary is the action, because an operator row carries no target.
 *
 * A row that cannot be written — the database or the table does not exist yet, or the write
 * would outlive the database — is not a second failure. The helper reports the outcome on the
 * command output instead, so an operator still sees it (R-65), and the command's own exit
 * decides the run.
 *
 * It takes the tenant context, never a pool (DEC-34): the one context owns the one connection,
 * and a command never builds its own.
 */
export async function writeAuditEvent(
  context: TenantContext,
  input: AuditEventInput
): Promise<void> {
  try {
    await context.db.$client.query(
      `insert into audit_event (actor_user_id, action, summary, metadata)
       values ($1, $2, $3, $4)`,
      [null, input.action, input.action, JSON.stringify(input.metadata)]
    );
  } catch {
    // R-65: the command output is the fallback sink. Nothing is rethrown, because the command's
    // own result, not the audit transport, decides whether it succeeded.
    input.output(
      `audit ${input.action}: ${JSON.stringify(input.metadata)} (not recorded)`
    );
  }
}
