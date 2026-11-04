import { and, asc, eq, sql } from "drizzle-orm";

import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import {
  agentArtifact,
  agentArtifactVersion,
  agentMessage,
  agentSession,
} from "../../schema.ts";
import type { PanelConfig } from "../charts/panel-config.ts";
import { checkedId } from "./store.ts";

/**
 * The artifacts of a chat (`DEC-56`, R-45a). A tool makes pending versions while the answer
 * streams, and `appendMessage` writes them with the answer. Every read joins the session on its
 * owner, so another person's chat answers no artifact.
 */

export const ARTIFACT_KINDS = [
  "chart",
  "table",
  "document",
  "record-list",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** A version that a tool made in this turn; `appendMessage` writes it with the answer. */
export type PendingVersion = {
  readonly toolCallId: string;
  readonly artifactId: string;
  readonly number: number;
  readonly isNew: boolean;
  readonly kind: ArtifactKind;
  readonly title: string;
  readonly version: number;
  readonly definition: PanelConfig;
};

export type AgentArtifact = {
  readonly id: string;
  readonly number: number;
  readonly kind: ArtifactKind;
  readonly title: string;
  readonly latestVersion: number;
  readonly versions: readonly {
    readonly version: number;
    readonly definition: PanelConfig;
    /** The text of the question before the answer that made it, or null. */
    readonly request: string | null;
    /** ISO instant. */
    readonly createdAt: string;
  }[];
};

function ownSession(ctx: ModuleRequestContext, sessionId: string) {
  return and(
    eq(agentArtifact.sessionId, checkedId(sessionId)),
    eq(agentSession.userId, ctx.caller.userId)
  );
}

/** How many artifacts the caller's chat stores; the next new one takes this count plus one. */
export async function storedArtifactCount(
  ctx: ModuleRequestContext,
  sessionId: string
): Promise<number> {
  const [row] = await ctx.tenant.db
    .select({ count: sql<number>`count(*)::int` })
    .from(agentArtifact)
    .innerJoin(agentSession, eq(agentSession.id, agentArtifact.sessionId))
    .where(ownSession(ctx, sessionId));

  return row?.count ?? 0;
}

/** The caller's artifact with this number in the chat, or undefined. */
export async function storedArtifact(
  ctx: ModuleRequestContext,
  sessionId: string,
  number: number
): Promise<
  | {
      readonly id: string;
      readonly kind: ArtifactKind;
      readonly latestVersion: number;
    }
  | undefined
> {
  const [row] = await ctx.tenant.db
    .select({
      id: agentArtifact.id,
      kind: agentArtifact.kind,
      latestVersion: agentArtifact.latestVersion,
    })
    .from(agentArtifact)
    .innerJoin(agentSession, eq(agentSession.id, agentArtifact.sessionId))
    .where(and(ownSession(ctx, sessionId), eq(agentArtifact.number, number)));

  return row;
}

/** Every artifact of the caller's chat by number, each with its versions in order. */
export async function listOwnArtifacts(
  ctx: ModuleRequestContext,
  sessionId: string
): Promise<readonly AgentArtifact[]> {
  const artifacts = await ctx.tenant.db
    .select({
      id: agentArtifact.id,
      number: agentArtifact.number,
      kind: agentArtifact.kind,
      title: agentArtifact.title,
      latestVersion: agentArtifact.latestVersion,
    })
    .from(agentArtifact)
    .innerJoin(agentSession, eq(agentSession.id, agentArtifact.sessionId))
    .where(ownSession(ctx, sessionId))
    .orderBy(asc(agentArtifact.number));

  if (artifacts.length === 0) return [];

  const answer = agentMessage;

  const versions = await ctx.tenant.db
    .select({
      artifactId: agentArtifactVersion.artifactId,
      version: agentArtifactVersion.version,
      definition: agentArtifactVersion.definition,
      createdAt: agentArtifactVersion.createdAt,
      // The question is the latest user message before the answer that made the version.
      request: sql<AgentMessageParts | null>`(select q.parts from agent_message q where q.session_id = ${answer.sessionId} and q.role = 'user' and q.seq < ${answer.seq} order by q.seq desc limit 1)`,
    })
    .from(agentArtifactVersion)
    .innerJoin(answer, eq(answer.id, agentArtifactVersion.messageId))
    .where(eq(answer.sessionId, sessionId))
    .orderBy(asc(agentArtifactVersion.version));

  return artifacts.map(({ id, number, kind, title, latestVersion }) => ({
    id,
    number,
    kind,
    title,
    latestVersion,
    versions: versions
      .filter(({ artifactId }) => artifactId === id)
      .map((row) => ({
        version: row.version,
        definition: row.definition,
        request: textOf(row.request),
        createdAt: row.createdAt.toISOString(),
      })),
  }));
}

type AgentMessageParts = (typeof agentMessage.$inferSelect)["parts"];

function textOf(parts: AgentMessageParts | null): string | null {
  if (parts === null) return null;

  const text = parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");

  return text === "" ? null : text;
}
