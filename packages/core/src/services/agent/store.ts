import type { UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
import { agentMessage, agentSession } from "../../schema.ts";

/**
 * The owner-only store of boss-agent chats (Spec 7 R-41). Every function filters on the signed-in
 * person's `user_id`, and another person's session answers `not-found`, the same as a missing one,
 * so a session id alone opens nothing.
 */

export type AgentMessage = UIMessage;

export type AgentSessionSummary = {
  readonly id: string;
  readonly title: string;
  readonly modelId: string;
  /** ISO instant. */
  readonly updatedAt: string;
};

export const AGENT_SESSION_LIST_LIMIT = 50;

const uuid = z.uuid();

const summaryColumns = {
  id: agentSession.id,
  title: agentSession.title,
  modelId: agentSession.modelId,
  updatedAt: agentSession.updatedAt,
};

function notFound(): AppError {
  return new AppError(CORE_ERRORS["not-found"]);
}

/** A malformed id answers not-found before any query, so a bad link never reaches Postgres. */
function checkedId(id: string): string {
  if (!uuid.safeParse(id).success) throw notFound();

  return id;
}

function summary(row: {
  readonly id: string;
  readonly title: string;
  readonly modelId: string;
  readonly updatedAt: Date;
}): AgentSessionSummary {
  return {
    id: row.id,
    title: row.title,
    modelId: row.modelId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ownedBy(ctx: ModuleRequestContext, id: string) {
  return and(
    eq(agentSession.id, id),
    eq(agentSession.userId, ctx.caller.userId)
  );
}

/** The caller's sessions, latest message first, at most 50. */
export async function listOwnSessions(
  ctx: ModuleRequestContext
): Promise<readonly AgentSessionSummary[]> {
  const rows = await ctx.tenant.db
    .select(summaryColumns)
    .from(agentSession)
    .where(eq(agentSession.userId, ctx.caller.userId))
    .orderBy(desc(agentSession.updatedAt), desc(agentSession.id))
    .limit(AGENT_SESSION_LIST_LIMIT);

  return rows.map(summary);
}

/** The caller's session; undefined when no row has the id; `not-found` for another person's id or a malformed id. */
export async function findOwnSession(
  ctx: ModuleRequestContext,
  id: string
): Promise<AgentSessionSummary | undefined> {
  const [row] = await ctx.tenant.db
    .select({ ...summaryColumns, userId: agentSession.userId })
    .from(agentSession)
    .where(eq(agentSession.id, checkedId(id)));

  if (row === undefined) return undefined;

  if (row.userId !== ctx.caller.userId) throw notFound();

  return summary(row);
}

/** Creates the caller's session (insert, conflict does nothing); `not-found` when the id belongs to another person. */
export async function createOwnSession(
  ctx: ModuleRequestContext,
  input: {
    readonly id: string;
    readonly title: string;
    readonly modelId: string;
  }
): Promise<AgentSessionSummary> {
  await ctx.tenant.db
    .insert(agentSession)
    .values({
      id: checkedId(input.id),
      userId: ctx.caller.userId,
      title: input.title,
      modelId: input.modelId,
    })
    .onConflictDoNothing({ target: agentSession.id });

  const created = await findOwnSession(ctx, input.id);

  if (created === undefined) throw notFound();

  return created;
}

/** The caller's session with its messages in order; `not-found` otherwise. */
export async function readOwnSession(
  ctx: ModuleRequestContext,
  id: string
): Promise<{
  readonly session: AgentSessionSummary;
  readonly messages: readonly AgentMessage[];
}> {
  const [row] = await ctx.tenant.db
    .select(summaryColumns)
    .from(agentSession)
    .where(ownedBy(ctx, checkedId(id)));

  if (row === undefined) throw notFound();

  const messages = await ctx.tenant.db
    .select({
      id: agentMessage.id,
      role: agentMessage.role,
      parts: agentMessage.parts,
    })
    .from(agentMessage)
    .where(eq(agentMessage.sessionId, row.id))
    .orderBy(asc(agentMessage.seq));

  return { session: summary(row), messages };
}

/** Appends one message with a server-made id and moves `updated_at`, in one transaction; `not-found` when the session is not the caller's. */
export async function appendMessage(
  ctx: ModuleRequestContext,
  sessionId: string,
  message: {
    readonly id?: string;
    readonly role: "user" | "assistant";
    readonly parts: AgentMessage["parts"];
  }
): Promise<string> {
  const id = checkedId(sessionId);

  return withTransaction(ctx.tenant, async (tx) => {
    // The row lock orders concurrent appends to one session, so `seq` follows the commits.
    const [owned] = await tx
      .select({ id: agentSession.id })
      .from(agentSession)
      .where(ownedBy(ctx, id))
      .for("update");

    if (owned === undefined) throw notFound();

    const [inserted] = await tx
      .insert(agentMessage)
      .values({
        // Only the route's assistant id is kept; a user message never names its own id.
        id: message.role === "assistant" ? message.id : undefined,
        sessionId: id,
        role: message.role,
        parts: message.parts,
      })
      .returning({ id: agentMessage.id });

    if (inserted === undefined) {
      throw new Error("the message insert returned no row");
    }

    await tx
      .update(agentSession)
      .set({ updatedAt: sql`now()` })
      .where(eq(agentSession.id, id));

    return inserted.id;
  });
}
