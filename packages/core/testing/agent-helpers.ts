import { randomUUID } from "node:crypto";

import { createParser } from "@openuidev/react-lang";
import {
  type UIMessageChunk,
  parseJsonEventStream,
  readUIMessageStream,
  simulateReadableStream,
  uiMessageChunkSchema,
} from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { artifactRefsOf } from "../src/features/agent/artifact-refs.ts";
import { PROMPT_VIEWS } from "../src/features/agent/catalog-prompt.ts";
import { answerLibrary } from "../src/features/agent/catalog.ts";
import type { Module } from "../src/lib/module-contract/module.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { agentSession } from "../src/schema.ts";
import {
  AGENT_RUN_JOB,
  AGENT_RUN_JOB_NAME,
  type AgentMessage,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/index.ts";
import { storeIntegrationKey } from "../src/services/integrations/keys.ts";
import { bossOf, type JobData } from "../src/services/job-queue/index.ts";
import { splitJobStarter } from "../src/services/job-queue/module-jobs.ts";
import { insertUser } from "./access-fixtures.ts";
import type { JsonValue } from "./model-transports.ts";

/** The recorded model's key: the replay transport answers it, so no live host ever sees it. */
const RECORDED_MODEL_KEY = "sk-or-v1-recorded-model-000000000000000000";

/**
 * Turns AI on for a test deployment: stores the model key, then writes the model settings and,
 * when given, the reporting date by SQL. Call it before the context's first settings read, because
 * the settings reader caches for 10 s and a later write is not seen (DEC-46).
 */
export async function writeModelConnection(
  context: TenantContext,
  input: {
    readonly allowed: readonly string[];
    readonly chat: string | null;
    readonly document: string | null;
    readonly reportingDate?: string;
  }
): Promise<void> {
  await storeIntegrationKey(context, {
    name: "model-provider",
    value: RECORDED_MODEL_KEY,
    actorUserId: await insertUser(context),
  });

  await context.db.$client.query(
    "update tenant_settings set allowed_models = $1::text[], chat_model = $2, document_model = $3, reporting_date = coalesce($4::date, reporting_date)",
    [input.allowed, input.chat, input.document, input.reportingDate ?? null]
  );
}

/** One agent_session row. Defaults: a random id, title "Chat", model "openai/gpt-6.1-terra". */
export async function insertAgentSession(
  context: TenantContext,
  values: { readonly userId: string } & Partial<
    typeof agentSession.$inferInsert
  >
): Promise<typeof agentSession.$inferSelect> {
  const [row] = await context.db
    .insert(agentSession)
    .values({
      id: randomUUID(),
      title: "Chat",
      modelId: "openai/gpt-6.1-terra",
      ...values,
    })
    .returning();

  if (row === undefined) throw new Error("The session was not inserted.");

  return row;
}

/**
 * Runs a session's queued `core.agent-run` job as the worker's job loop does: the job's data without
 * the starter key, and the starter's principal built now. The pg-boss job stays `created`, because
 * nothing completes it, so recovery treats it as live.
 */
export async function runQueuedAgentRun(
  context: TenantContext,
  modules: readonly Module[],
  sessionId: string
): Promise<void> {
  const [row] = await context.db
    .select({ runJobId: agentSession.runJobId })
    .from(agentSession)
    .where(eq(agentSession.id, sessionId));

  if (row?.runJobId === null || row === undefined) {
    throw new Error("The session has no queued run.");
  }

  const boss = await bossOf(context.jobQueue);
  const [job] = await boss.findJobs(AGENT_RUN_JOB_NAME, { id: row.runJobId });

  if (job === undefined) throw new Error("The run's job does not exist.");

  // SAFETY: pg-boss stores the JSON object that `startRun` sent as the job's data.
  const { data, startedBy } = splitJobStarter(job.data as JobData);

  const caller =
    startedBy === undefined
      ? undefined
      : principalFor({
          tenant: context,
          modules,
          userId: startedBy,
          authenticated: true,
        });

  // SAFETY: the run job's data is the `{ sessionId }` that `startRun` sent.
  const payload = data as { readonly sessionId: string };

  await AGENT_RUN_JOB.handler(
    caller === undefined ? { tenant: context } : { tenant: context, caller },
    payload
  );
}

/**
 * The `config` of each `Chart` child of an answer's root, in reading order, parsed with the same
 * catalog as the prompt. Throws when the parser reports an error or an unresolved name, so a
 * broken answer fails its test instead of losing a chart.
 */
export function answerChartConfigs(text: string): readonly unknown[] {
  return answerChildren(text).flatMap(({ typeName, props }) =>
    typeName === "Chart" ? [props["config"]] : []
  );
}

/** One block of an answer's root: its component and the text a person reads (a Chart has none). */
export type AnswerBlock = {
  readonly kind: "Heading" | "Paragraph" | "List" | "Chart";
  readonly text: string;
};

const BLOCK = z.discriminatedUnion("typeName", [
  z.object({
    typeName: z.enum(["Heading", "Paragraph"]),
    props: z.object({ text: z.string() }),
  }),
  z.object({
    typeName: z.literal("List"),
    props: z.object({ items: z.array(z.string()) }),
  }),
  z.object({ typeName: z.literal("Chart") }),
]);

/**
 * Every block of an answer's root in reading order, parsed as `answerChartConfigs` parses it. A
 * List's items are joined with a line break. Throws as `answerChartConfigs` does.
 */
export function answerBlocks(text: string): readonly AnswerBlock[] {
  return answerChildren(text).map((child) => {
    const block = BLOCK.parse(child);

    if (block.typeName === "Chart") return { kind: "Chart", text: "" };

    if (block.typeName === "List") {
      return { kind: "List", text: block.props.items.join("\n") };
    }

    return { kind: block.typeName, text: block.props.text };
  });
}

/** The config of each artifact card of a stored answer. A refused call has no card. */
export function answerArtifactConfigs(
  message: AgentMessage
): readonly unknown[] {
  return artifactRefsOf(message).map(({ config }) => config);
}

function answerChildren(text: string) {
  const { root, meta } = createParser(
    answerLibrary(PROMPT_VIEWS).toJSONSchema(),
    "Answer"
  ).parse(text);

  if (meta.errors.length > 0 || meta.unresolved.length > 0 || root === null) {
    throw new Error(
      `The answer does not parse: ${JSON.stringify({ errors: meta.errors, unresolved: meta.unresolved })}`
    );
  }

  return ANSWER_CHILDREN.parse(root.props["children"]);
}

/** The children of a parsed root: element nodes, each with its component name and props. */
const ANSWER_CHILDREN = z.array(
  z.object({ typeName: z.string(), props: z.record(z.string(), z.unknown()) })
);

/** A POST to the agent route with a JSON body and its `content-length`, as a browser sends it. */
export function agentRequest(
  body: JsonValue,
  headers: Readonly<Record<string, string>> = {}
): Request {
  const text = JSON.stringify(body);

  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(text)),
      ...headers,
    },
    body: text,
  });
}

/**
 * Reads the agent route's whole answer: each server-sent event checked as an AI SDK UI message
 * chunk, and the assistant message the chunks build, as the browser's chat reads them.
 */
export async function readAgentReply(response: Response): Promise<{
  readonly chunks: readonly UIMessageChunk[];
  readonly message: AgentMessage | undefined;
}> {
  if (response.body === null) throw new Error("The agent reply has no body.");

  const chunks: UIMessageChunk[] = [];

  for await (const parsed of parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  })) {
    if (!parsed.success) throw parsed.error;

    chunks.push(parsed.value);
  }

  let message: AgentMessage | undefined;

  for await (const state of readUIMessageStream({
    stream: simulateReadableStream({ chunks }),
    terminateOnError: true,
  })) {
    message = state;
  }

  return { chunks, message };
}
