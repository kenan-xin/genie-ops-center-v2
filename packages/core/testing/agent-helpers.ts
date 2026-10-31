import { createParser } from "@openuidev/react-lang";
import {
  type UIMessageChunk,
  parseJsonEventStream,
  readUIMessageStream,
  simulateReadableStream,
  uiMessageChunkSchema,
} from "ai";
import { z } from "zod";

import { PROMPT_VIEWS } from "../src/features/agent/catalog-prompt.ts";
import { answerLibrary } from "../src/features/agent/catalog.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import type { AgentMessage } from "../src/services/agent/index.ts";
import { storeIntegrationKey } from "../src/services/integrations/keys.ts";
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

/**
 * The `config` of each `Chart` child of an answer's root, in reading order, parsed with the same
 * catalog as the prompt. Throws when the parser reports an error or an unresolved name, so a
 * broken answer fails its test instead of losing a chart.
 */
export function answerChartConfigs(text: string): readonly unknown[] {
  const { root, meta } = createParser(
    answerLibrary(PROMPT_VIEWS).toJSONSchema(),
    "Answer"
  ).parse(text);

  if (meta.errors.length > 0 || meta.unresolved.length > 0 || root === null) {
    throw new Error(
      `The answer does not parse: ${JSON.stringify({ errors: meta.errors, unresolved: meta.unresolved })}`
    );
  }

  return ANSWER_CHILDREN.parse(root.props["children"]).flatMap(
    ({ typeName, props }) => (typeName === "Chart" ? [props["config"]] : [])
  );
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
