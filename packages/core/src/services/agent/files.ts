import { and, asc, eq } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { agentFile, agentSession } from "../../schema.ts";
import { ASK_PERMISSION } from "../authorization/roles.ts";
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

/** Deletes a file row that no job will make, such as one whose job could not be queued. */
export async function deleteAgentFile(
  ctx: ModuleRequestContext,
  id: string
): Promise<void> {
  await ctx.tenant.db.delete(agentFile).where(eq(agentFile.id, id));
}

function ownFile(ctx: ModuleRequestContext) {
  return eq(agentSession.userId, ctx.caller.userId);
}

/** The files of the caller's chat, oldest first; another person's chat answers none. */
export async function listOwnFiles(
  ctx: ModuleRequestContext,
  sessionId: string
): Promise<readonly AgentFile[]> {
  return ctx.tenant.db
    .select({
      id: agentFile.id,
      toolCallId: agentFile.toolCallId,
      title: agentFile.title,
      format: agentFile.format,
      state: agentFile.state,
      rowCount: agentFile.rowCount,
    })
    .from(agentFile)
    .innerJoin(agentSession, eq(agentSession.id, agentFile.sessionId))
    .where(and(eq(agentFile.sessionId, checkedId(sessionId)), ownFile(ctx)))
    .orderBy(asc(agentFile.createdAt), asc(agentFile.id));
}

/**
 * A download link for the caller's own made file, which only they open (R-41). A file of another
 * person, or one still being made, is `not-found`.
 */
export async function ownFileLink(
  ctx: ModuleRequestContext,
  id: string
): Promise<{ readonly url: string }> {
  const [row] = await ctx.tenant.db
    .select({ fileId: agentFile.fileId })
    .from(agentFile)
    .innerJoin(agentSession, eq(agentSession.id, agentFile.sessionId))
    .where(
      and(
        eq(agentFile.id, checkedId(id)),
        eq(agentFile.state, "ready"),
        ownFile(ctx)
      )
    );

  if (row?.fileId === null || row === undefined) {
    throw new AppError(CORE_ERRORS["not-found"]);
  }

  const { url } = await ctx.tenant.fileStorage.createOwnerLink({
    fileId: row.fileId,
    principal: ctx.caller,
    permission: ASK_PERMISSION,
  });

  return { url };
}
