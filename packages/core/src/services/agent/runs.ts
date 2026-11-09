import { and, eq, isNotNull, sql } from "drizzle-orm";

import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { agentSession } from "../../schema.ts";

/**
 * The run columns of `agent_session` (R-42b): a run moves from `queued` to `running`, may be asked
 * to stop (`stopping`), and ends with `run_state` null and `run_error` saying why it did not finish.
 */

export const AGENT_RUN_JOB_NAME = "core.agent-run";

/** queued -> running only, so a run that was stopped or ended never starts. */
export async function markRunning(
  tenant: TenantContext,
  sessionId: string
): Promise<boolean> {
  const moved = await tenant.db
    .update(agentSession)
    .set({ runState: "running" })
    .where(
      and(eq(agentSession.id, sessionId), eq(agentSession.runState, "queued"))
    )
    .returning({ id: agentSession.id });

  return moved.length > 0;
}

/**
 * Ends the session's run: `run_state` null, and `run_error` `stopped` when Stop was asked, else
 * `code`. Nothing for a session with no run.
 */
export async function endRun(
  tenant: TenantContext,
  sessionId: string,
  code: "failed" | null
): Promise<void> {
  await tenant.db
    .update(agentSession)
    .set({
      runState: null,
      runError: sql`case when ${agentSession.runState} = 'stopping' then 'stopped' else ${code}::text end`,
    })
    .where(
      and(eq(agentSession.id, sessionId), isNotNull(agentSession.runState))
    );
}
