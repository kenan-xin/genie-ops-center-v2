import { and, eq } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { agentFile, agentSession } from "../../schema.ts";
import type { DatasetQuery } from "../datasets/query.ts";
import type { FileFormat } from "./file-kinds.ts";
import { checkedId } from "./store.ts";

/**
 * The list files of a chat (R-44a, S7-35). The `make-file` tool records a row here and queues the
 * core job that makes it. This file imports no file writer, so the agent route stays light.
 */

export type AgentFileState = "queued" | "running" | "ready" | "failed";

export type AgentFile = {
  readonly id: string;
  readonly toolCallId: string;
  readonly title: string;
  readonly format: FileFormat;
  readonly state: AgentFileState;
  readonly rowCount: number | null;
};

/** Records a queued file in the caller's chat and answers its id; another person's chat is `not-found`. */
export async function createAgentFile(
  ctx: ModuleRequestContext,
  input: {
    readonly sessionId: string;
    readonly toolCallId: string;
    readonly title: string;
    readonly format: FileFormat;
    readonly dataset: string;
    readonly query: DatasetQuery;
  }
): Promise<string> {
  const [session] = await ctx.tenant.db
    .select({ id: agentSession.id })
    .from(agentSession)
    .where(
      and(
        eq(agentSession.id, checkedId(input.sessionId)),
        eq(agentSession.userId, ctx.caller.userId)
      )
    );

  if (session === undefined) throw new AppError(CORE_ERRORS["not-found"]);

  const [row] = await ctx.tenant.db
    .insert(agentFile)
    .values({
      sessionId: session.id,
      toolCallId: input.toolCallId,
      title: input.title,
      format: input.format,
      dataset: input.dataset,
      query: input.query,
    })
    .returning({ id: agentFile.id });

  if (row === undefined) throw new Error("The insert returned no row.");

  return row.id;
}
