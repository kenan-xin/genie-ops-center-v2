import type { UIMessage } from "ai";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import {
  agentArtifact,
  agentArtifactVersion,
  agentFile,
  agentMessage,
  agentSession,
} from "../../schema.ts";
import type { PendingVersion } from "./artifacts.ts";
import { type AgentRunStatus, runStatus } from "./runs.ts";
import { recordAddress } from "./surface-address.ts";
import { listSurfaces } from "./surfaces.ts";

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
  /** `core:ask`, or the id of the module whose surface runs the session. */
  readonly surface: string;
  /** The record a surface session builds; null on Ask. */
  readonly recordId: string | null;
  /** The state of the session's background run; null when none runs (R-42b). */
  readonly runState: "queued" | "running" | "stopping" | null;
  /** ISO instant. */
  readonly updatedAt: string;
};

export const AGENT_SESSION_LIST_LIMIT = 50;

const uuid = z.uuid();

const summaryColumns = {
  id: agentSession.id,
  title: agentSession.title,
  modelId: agentSession.modelId,
  surface: agentSession.surface,
  recordId: agentSession.recordId,
  runState: agentSession.runState,
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
  readonly surface: string;
  readonly recordId: string | null;
  readonly runState: AgentSessionSummary["runState"];
  readonly updatedAt: Date;
}): AgentSessionSummary {
  return {
    id: row.id,
    title: row.title,
    modelId: row.modelId,
    surface: row.surface,
    recordId: row.recordId,
    runState: row.runState,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const messageColumns = {
  id: agentMessage.id,
  seq: agentMessage.seq,
  role: agentMessage.role,
  parts: agentMessage.parts,
  createdAt: agentMessage.createdAt,
};

// The time lets a stored answer show how long it took; the model never reads metadata.
function storedMessage(
  row: {
    readonly id: string;
    readonly role: AgentMessage["role"];
    readonly parts: AgentMessage["parts"];
    readonly createdAt: Date;
  },
  summaryText: string | null
): AgentMessage {
  const createdAt = row.createdAt.toISOString();

  return {
    id: row.id,
    role: row.role,
    parts: row.parts,
    metadata:
      summaryText === null
        ? { createdAt }
        : { createdAt, summary: summaryText },
  };
}

function ownedBy(ctx: ModuleRequestContext, id: string) {
  return and(
    eq(agentSession.id, id),
    eq(agentSession.userId, ctx.caller.userId)
  );
}

/**
 * The caller's sessions of one surface, Ask by default (R-42), latest message first, at most 50.
 * With a record, that record's chats come first.
 */
export async function listOwnSessions(
  ctx: ModuleRequestContext,
  filter: {
    readonly surface?: string | undefined;
    readonly recordId?: string | undefined;
  } = {}
): Promise<readonly AgentSessionSummary[]> {
  const first =
    filter.recordId === undefined
      ? []
      : [
          sql`case when ${agentSession.recordId} = ${filter.recordId} then 0 else 1 end`,
        ];

  const rows = await ctx.tenant.db
    .select(summaryColumns)
    .from(agentSession)
    .where(
      and(
        eq(agentSession.userId, ctx.caller.userId),
        eq(agentSession.surface, filter.surface ?? ASK_SURFACE)
      )
    )
    .orderBy(...first, desc(agentSession.updatedAt), desc(agentSession.id))
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
    /** A new chat on a surface's record page is bound to that surface and record (P11-26). */
    readonly surface?: string;
    readonly recordId?: string | null;
  }
): Promise<AgentSessionSummary> {
  await ctx.tenant.db
    .insert(agentSession)
    .values({
      id: checkedId(input.id),
      userId: ctx.caller.userId,
      title: input.title,
      modelId: input.modelId,
      surface: input.surface ?? ASK_SURFACE,
      recordId: input.recordId ?? null,
    })
    .onConflictDoNothing({ target: agentSession.id });

  const created = await findOwnSession(ctx, input.id);

  if (created === undefined) throw notFound();

  return created;
}

/**
 * The target session of a handoff and its first user message, through the handoff's transaction
 * (S7-41). The session takes the Ask session's model and the brief's title.
 */
export async function insertHandedSession(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  input: {
    readonly id: string;
    readonly surface: string;
    readonly recordId: string;
    readonly handedFromSessionId: string;
    readonly title: string;
    readonly modelId: string;
    readonly parts: AgentMessage["parts"];
  }
): Promise<void> {
  await tx.insert(agentSession).values({
    id: checkedId(input.id),
    userId: ctx.caller.userId,
    surface: input.surface,
    recordId: input.recordId,
    handedFromSessionId: input.handedFromSessionId,
    title: input.title,
    modelId: input.modelId,
  });

  await tx
    .insert(agentMessage)
    .values({ sessionId: input.id, role: "user", parts: input.parts });
}

/** Renames the caller's session; `updated_at` stays, so the list keeps its order. `not-found` otherwise. */
export async function renameOwnSession(
  ctx: ModuleRequestContext,
  id: string,
  title: string
): Promise<AgentSessionSummary> {
  const [row] = await ctx.tenant.db
    .update(agentSession)
    .set({ title })
    .where(ownedBy(ctx, checkedId(id)))
    .returning(summaryColumns);

  if (row === undefined) throw notFound();

  return summary(row);
}

/**
 * Deletes the caller's session in one transaction: the stored bytes of its made files through
 * `FileStorage`, then the session row, whose messages, artifacts and file rows cascade. No audit
 * row: a chat is the person's own data (P08-8). `not-found` otherwise.
 */
export async function deleteOwnSession(
  ctx: ModuleRequestContext,
  id: string
): Promise<void> {
  const checked = checkedId(id);

  await withTransaction(ctx.tenant, async (tx) => {
    const [owned] = await tx
      .select({ id: agentSession.id })
      .from(agentSession)
      .where(ownedBy(ctx, checked))
      .for("update");

    if (owned === undefined) throw notFound();

    const made = await tx
      .select({ fileId: agentFile.fileId })
      .from(agentFile)
      .where(eq(agentFile.sessionId, checked));

    await ctx.tenant.fileStorage.remove(
      made.flatMap(({ fileId }) => (fileId === null ? [] : [fileId])),
      tx
    );

    await tx.delete(agentSession).where(eq(agentSession.id, checked));
  });
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
    .select({
      ...summaryColumns,
      summary: agentSession.summary,
      summaryThroughSeq: agentSession.summaryThroughSeq,
    })
    .from(agentSession)
    .where(ownedBy(ctx, checkedId(id)));

  if (row === undefined) throw notFound();

  const messages = await ctx.tenant.db
    .select(messageColumns)
    .from(agentMessage)
    .where(eq(agentMessage.sessionId, row.id))
    .orderBy(asc(agentMessage.seq));

  return {
    session: summary(row),
    messages: messages.map((message) =>
      storedMessage(
        message,
        // Only the last summarized message carries the summary, so the chat draws its line once.
        message.seq === row.summaryThroughSeq ? row.summary : null
      )
    ),
  };
}

export type AgentSessionDetail = AgentSessionSummary & {
  readonly handedFromSessionId: string | null;
  readonly run: AgentRunStatus | null;
  /** The surface's name and the record's page; null on Ask or when the surface is not listed. */
  readonly agentName: string | null;
  readonly address: string | null;
};

/**
 * The caller's session with its run status, then its messages, which the card and the panel poll
 * (P11-32). The row is read first, so a read that sees the run end also holds the final answer.
 * Null for an id that is not the caller's or not saved.
 */
export async function readOwnSessionDetail(
  ctx: ModuleRequestContext,
  id: string
): Promise<{
  readonly session: AgentSessionDetail;
  readonly messages: readonly AgentMessage[];
} | null> {
  if (!uuid.safeParse(id).success) return null;

  const [row] = await ctx.tenant.db
    .select({
      ...summaryColumns,
      handedFromSessionId: agentSession.handedFromSessionId,
      runError: agentSession.runError,
      runJobId: agentSession.runJobId,
    })
    .from(agentSession)
    .where(ownedBy(ctx, id));

  if (row === undefined) return null;

  const [{ messages }, surfaces] = await Promise.all([
    readOwnSession(ctx, id),
    listSurfaces(ctx),
  ]);

  const surface = surfaces.find(({ id: listed }) => listed === row.surface);

  return {
    session: {
      ...summary(row),
      handedFromSessionId: row.handedFromSessionId,
      run: runStatus(row),
      agentName: surface?.name ?? null,
      address:
        surface === undefined || row.recordId === null
          ? null
          : recordAddress(surface.recordPage, row.recordId),
    },
    messages,
  };
}

/** What the model reads of a session: its summary, and only the messages after the summary. */
export type OwnHistory = {
  readonly summary: string | null;
  readonly summaryThroughSeq: number | null;
  readonly lastInputTokens: number | null;
  readonly messages: readonly {
    readonly seq: number;
    readonly message: AgentMessage;
  }[];
};

/** The caller's session summary and the messages after it, in order; `not-found` otherwise. */
export async function readOwnHistory(
  ctx: ModuleRequestContext,
  id: string
): Promise<OwnHistory> {
  const [row] = await ctx.tenant.db
    .select({
      id: agentSession.id,
      summary: agentSession.summary,
      summaryThroughSeq: agentSession.summaryThroughSeq,
      lastInputTokens: agentSession.lastInputTokens,
    })
    .from(agentSession)
    .where(ownedBy(ctx, checkedId(id)));

  if (row === undefined) throw notFound();

  const messages = await ctx.tenant.db
    .select(messageColumns)
    .from(agentMessage)
    .where(
      and(
        eq(agentMessage.sessionId, row.id),
        row.summaryThroughSeq === null
          ? undefined
          : gt(agentMessage.seq, row.summaryThroughSeq)
      )
    )
    .orderBy(asc(agentMessage.seq));

  return {
    summary: row.summary,
    summaryThroughSeq: row.summaryThroughSeq,
    lastInputTokens: row.lastInputTokens,
    messages: messages.map((message) => ({
      seq: message.seq,
      message: storedMessage(message, null),
    })),
  };
}

/**
 * Stores the summary of the messages up to `throughSeq` and clears the stored input size, which
 * measured the prompt before the summary. Only a later cut replaces a summary, so an overlapping
 * turn never puts back an older one. Answers whether the session changed.
 */
export async function saveSummary(
  ctx: ModuleRequestContext,
  id: string,
  input: { readonly summary: string; readonly throughSeq: number }
): Promise<boolean> {
  const changed = await ctx.tenant.db
    .update(agentSession)
    .set({
      summary: input.summary,
      summaryThroughSeq: input.throughSeq,
      lastInputTokens: null,
    })
    .where(
      and(
        ownedBy(ctx, checkedId(id)),
        or(
          isNull(agentSession.summaryThroughSeq),
          lt(agentSession.summaryThroughSeq, input.throughSeq)
        )
      )
    )
    .returning({ id: agentSession.id });

  return changed.length > 0;
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
 * so a failed write stores neither. An assistant message whose id is stored already replaces its
 * parts and keeps its place, so a run's checkpoints and its final answer stay one message (R-42b).
 * With `turn.run`, the save needs that job to hold the session's run, `stopping` included; a run
 * that ended or that a new run replaced answers `not-found` and writes nothing.
 */
export async function appendMessage(
  ctx: ModuleRequestContext,
  sessionId: string,
  message: {
    readonly id?: string;
    readonly role: "user" | "assistant";
    readonly parts: AgentMessage["parts"];
  },
  versions: readonly PendingVersion[] = [],
  turn: {
    readonly inputTokens?: number;
    readonly run?: { readonly jobId: string };
  } = {}
): Promise<string> {
  const id = checkedId(sessionId);

  return withTransaction(ctx.tenant, async (tx) => {
    // The row lock orders concurrent appends to one session, so `seq` follows the commits.
    const [owned] = await tx
      .select({ id: agentSession.id })
      .from(agentSession)
      .where(
        turn.run === undefined
          ? ownedBy(ctx, id)
          : // A run saves only while its job holds the session's run; `stopping` still saves.
            and(
              ownedBy(ctx, id),
              eq(agentSession.runJobId, turn.run.jobId),
              isNotNull(agentSession.runState)
            )
      )
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
      .onConflictDoUpdate({
        target: agentMessage.id,
        set: { parts: sql`excluded.parts` },
        // Only an assistant message of this session; another id answers no row.
        setWhere: sql`${agentMessage.role} = 'assistant' and ${agentMessage.sessionId} = ${id}`,
      })
      .returning({ id: agentMessage.id });

    if (inserted === undefined) throw notFound();

    for (const pending of settled) {
      // In order: a new artifact's row comes before its versions, and a version moves its latest.
      // oxlint-disable-next-line no-await-in-loop -- one transaction, written in the turn's order
      await writeVersion(tx, id, inserted.id, pending);
    }

    await tx
      .update(agentSession)
      .set(
        turn.inputTokens === undefined
          ? { updatedAt: sql`now()` }
          : { updatedAt: sql`now()`, lastInputTokens: turn.inputTokens }
      )
      .where(eq(agentSession.id, id));

    return inserted.id;
  });
}
