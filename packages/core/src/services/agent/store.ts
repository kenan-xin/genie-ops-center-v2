import type { UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import {
  agentArtifact,
  agentArtifactVersion,
  agentMessage,
  agentSession,
} from "../../schema.ts";
import type { PendingVersion } from "./artifacts.ts";

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
export function checkedId(id: string): string {
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
      createdAt: agentMessage.createdAt,
    })
    .from(agentMessage)
    .where(eq(agentMessage.sessionId, row.id))
    .orderBy(asc(agentMessage.seq));

  // The time lets a stored answer show how long it took; the model never reads metadata.
  return {
    session: summary(row),
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts,
      metadata: { createdAt: message.createdAt.toISOString() },
    })),
  };
}

/**
 * The turn's versions numbered after what the chat stores now: a new artifact takes the next free
 * number, and a change the next version of its artifact. Two overlapping turns of one chat read the
 * same stored count, so without this the later answer would fail its unique check and be lost.
 */
async function settleVersions(
  tx: TenantTransaction,
  sessionId: string,
  versions: readonly PendingVersion[]
): Promise<readonly PendingVersion[]> {
  if (versions.length === 0) return [];

  const stored = await tx
    .select({
      id: agentArtifact.id,
      number: agentArtifact.number,
      latestVersion: agentArtifact.latestVersion,
    })
    .from(agentArtifact)
    .where(eq(agentArtifact.sessionId, sessionId));

  const numbers = new Map(stored.map(({ id, number }) => [id, number]));

  const latest = new Map(
    stored.map(({ id, latestVersion }) => [id, latestVersion])
  );

  let next = Math.max(0, ...stored.map(({ number }) => number)) + 1;

  const settled: PendingVersion[] = [];

  for (const pending of versions) {
    const before = pending.isNew ? 0 : latest.get(pending.artifactId);

    // A change names an artifact of this chat only; the tool found it through the owner's chat.
    if (before === undefined) throw notFound();

    const number = pending.isNew ? next++ : numbers.get(pending.artifactId);

    if (number === undefined) throw notFound();

    numbers.set(pending.artifactId, number);
    latest.set(pending.artifactId, before + 1);
    settled.push({ ...pending, number, version: before + 1 });
  }

  return settled;
}

/** The answer's tool outputs and card parts with the settled numbers and versions. */
function withSettledArtifacts(
  parts: AgentMessage["parts"],
  settled: readonly PendingVersion[]
): AgentMessage["parts"] {
  const byCall = new Map(settled.map((entry) => [entry.toolCallId, entry]));

  const result: AgentMessage["parts"] = [];

  for (const part of parts) {
    const call =
      "toolCallId" in part
        ? byCall.get(part.toolCallId)
        : part.type === "data-artifact" && "id" in part
          ? byCall.get(part.id ?? "")
          : undefined;

    if (call === undefined) {
      result.push(part);
    } else if (part.type === "data-artifact") {
      result.push({
        ...part,
        data: { artifactId: call.artifactId, version: call.version },
      });
    } else if ("state" in part && part.state === "output-available") {
      result.push({
        ...part,
        output: {
          artifact: call.number,
          version: call.version,
          title: call.title,
        },
      });
    } else {
      result.push(part);
    }
  }

  return result;
}

async function writeVersion(
  tx: TenantTransaction,
  sessionId: string,
  messageId: string,
  pending: PendingVersion
): Promise<void> {
  if (pending.isNew) {
    await tx.insert(agentArtifact).values({
      id: pending.artifactId,
      sessionId,
      number: pending.number,
      kind: pending.kind,
      title: pending.title,
      latestVersion: pending.version,
    });
  } else {
    await tx
      .update(agentArtifact)
      .set({
        title: pending.title,
        latestVersion: pending.version,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(agentArtifact.id, pending.artifactId),
          eq(agentArtifact.sessionId, sessionId)
        )
      );
  }

  await tx.insert(agentArtifactVersion).values({
    artifactId: pending.artifactId,
    version: pending.version,
    definition: pending.definition,
    messageId,
  });
}

/**
 * Appends one message with a server-made id and moves `updated_at`, in one transaction; `not-found`
 * when the session is not the caller's. The answer's artifact versions go in the same transaction,
 * so a failed write stores neither.
 */
export async function appendMessage(
  ctx: ModuleRequestContext,
  sessionId: string,
  message: {
    readonly id?: string;
    readonly role: "user" | "assistant";
    readonly parts: AgentMessage["parts"];
  },
  versions: readonly PendingVersion[] = []
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

    // Under the lock: an overlapping turn may have stored the numbers this turn read as free.
    const settled = await settleVersions(tx, id, versions);

    const [inserted] = await tx
      .insert(agentMessage)
      .values({
        // Only the route's assistant id is kept; a user message never names its own id.
        id: message.role === "assistant" ? message.id : undefined,
        sessionId: id,
        role: message.role,
        parts: withSettledArtifacts(message.parts, settled),
      })
      .returning({ id: agentMessage.id });

    if (inserted === undefined) {
      throw new Error("the message insert returned no row");
    }

    for (const pending of settled) {
      // In order: a new artifact's row comes before its versions, and a version moves its latest.
      // oxlint-disable-next-line no-await-in-loop -- one transaction, written in the turn's order
      await writeVersion(tx, id, inserted.id, pending);
    }

    await tx
      .update(agentSession)
      .set({ updatedAt: sql`now()` })
      .where(eq(agentSession.id, id));

    return inserted.id;
  });
}
