import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { agentSession } from "../../schema.ts";
import { checkedId } from "./store.ts";

/**
 * The run columns of `agent_session` (R-42b): a run moves from `queued` to `running`, may be asked
 * to stop (`stopping`), and ends with `run_state` null and `run_error` saying why it did not finish.
 */

export const AGENT_RUN_JOB_NAME = "core.agent-run";

/**
 * Asks the caller's run to stop: `queued` or `running` becomes `stopping`, and the job ends it
 * within about a second (R-42b). A session with no run is left as it is, because Stop can race the
 * end of a run. Another person's or an unknown session is `not-found`.
 */
export async function stopRun(
  ctx: ModuleRequestContext,
  sessionId: string
): Promise<void> {
  const owned = and(
    eq(agentSession.id, checkedId(sessionId)),
    eq(agentSession.userId, ctx.caller.userId)
  );

  const moved = await ctx.tenant.db
    .update(agentSession)
    .set({ runState: "stopping" })
    .where(and(owned, inArray(agentSession.runState, ["queued", "running"])))
    .returning({ id: agentSession.id });

  if (moved.length > 0) return;

  const [found] = await ctx.tenant.db
    .select({ id: agentSession.id })
    .from(agentSession)
    .where(owned);

  if (found === undefined) throw new AppError(CORE_ERRORS["not-found"]);
}

/** The session's run state, or `gone` when the session was deleted. */
export async function readRunState(
  tenant: TenantContext,
  sessionId: string
): Promise<"queued" | "running" | "stopping" | null | "gone"> {
  const [row] = await tenant.db
    .select({ runState: agentSession.runState })
    .from(agentSession)
    .where(eq(agentSession.id, sessionId));

  return row === undefined ? "gone" : row.runState;
}

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
