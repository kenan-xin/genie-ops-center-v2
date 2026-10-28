import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  JsonToSseTransformStream,
  parseJsonEventStream,
  simulateReadableStream,
} from "ai";
import { isEqual } from "es-toolkit";
import { z } from "zod";

import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import {
  MODEL_REQUEST_TIMEOUT_MS,
  type ModelTransport,
  setModelConnection,
} from "../src/services/models/connection.ts";

/** The absolute path of packages/core/testing/model-recordings. */
export const CORE_MODEL_RECORDINGS = fileURLToPath(
  new URL("model-recordings", import.meta.url)
);

/** Sends this context's model requests through `transport`, still behind the request guard. */
export function useModelTransport(
  context: TenantContext,
  connection: {
    readonly transport: ModelTransport;
    readonly timeoutMs?: number;
  }
): void {
  setModelConnection(context, {
    transport: connection.transport,
    timeoutMs: connection.timeoutMs ?? MODEL_REQUEST_TIMEOUT_MS,
  });
}

/** What a test reads back from the recorded model: every request it was sent. */
export type RecordedModel = { readonly sent: readonly SentModelRequest[] };

/** Replays the recordings of `directory` for this context's model requests. */
export function useRecordedModel(
  context: TenantContext,
  directory: string
): RecordedModel {
  const transport = replayModelTransport(loadModelRecordings(directory));

  useModelTransport(context, { transport });

  return { sent: transport.sent };
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type SentModelRequest = {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: unknown;
};

export type ModelRecording = {
  readonly name: string;
  readonly request: {
    readonly method: "POST";
    readonly url: string;
    readonly body: JsonValue;
  };
  readonly response:
    | { readonly status: number; readonly body: JsonValue }
    | { readonly status: number; readonly events: readonly JsonValue[] };
};

const jsonValueSchema = z.json();

const recordingSchema = z.object({
  name: z.string(),
  request: z.object({
    method: z.literal("POST"),
    url: z.string(),
    body: jsonValueSchema,
  }),
  response: z.union([
    z.object({ status: z.number().int(), body: jsonValueSchema }),
    z.object({ status: z.number().int(), events: z.array(jsonValueSchema) }),
  ]),
});

/**
 * Every `*.json` recording of a folder, in file-name order, each parsed against
 * the recording shape so a broken file fails with its own name.
 */
export function loadModelRecordings(
  directory: string
): readonly ModelRecording[] {
  const files = readdirSync(directory).filter((file) => file.endsWith(".json"));

  files.sort();

  return files.map((file) => parseRecording(directory, file));
}

function parseRecording(directory: string, file: string): ModelRecording {
  try {
    return recordingSchema.parse(
      JSON.parse(readFileSync(join(directory, file), "utf8"))
    );
  } catch (error) {
    throw new Error(
      `Model recording ${file} is broken: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
}

/**
 * The provider's answer for a recording: a JSON body, or the recorded events as
 * a server-sent-event stream that ends with `data: [DONE]`.
 */
export function responseFromRecording(recording: ModelRecording): Response {
  if ("body" in recording.response) {
    return new Response(JSON.stringify(recording.response.body), {
      status: recording.response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const stream = simulateReadableStream({
    chunks: [...recording.response.events],
  })
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream());

  return new Response(stream, {
    status: recording.response.status,
    headers: { "content-type": "text/event-stream" },
  });
}

/** The inverse of `responseFromRecording`. `parseJsonEventStream` drops `[DONE]`. */
export async function recordingFromResponse(
  response: Response
): Promise<ModelRecording["response"]> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    return { status: response.status, events: await streamEvents(response) };
  }

  return {
    status: response.status,
    body: jsonValueSchema.parse(await response.json()),
  };
}

async function streamEvents(response: Response): Promise<readonly JsonValue[]> {
  if (response.body === null) {
    throw new Error("A recorded stream response has no body.");
  }

  const events: JsonValue[] = [];

  for await (const parsed of parseJsonEventStream({
    stream: response.body,
    schema: jsonValueSchema,
  })) {
    if (!parsed.success) {
      throw new Error(
        `A recorded stream event is not JSON: ${parsed.error.message}`
      );
    }

    events.push(parsed.value);
  }

  return events;
}

/**
 * A fetch that answers the recording whose method, URL and whole parsed body
 * match, and records each request's URL, authorization header and parsed body in
 * `sent`. The no-match error names no header. A recording is never used up, so
 * two equal requests get the same answer.
 */
export function replayModelTransport(
  recordings: readonly ModelRecording[]
): typeof globalThis.fetch & { readonly sent: readonly SentModelRequest[] } {
  const sent: SentModelRequest[] = [];

  const transport: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = request?.url ?? String(input);
    const method = init?.method ?? request?.method ?? "GET";
    const headers = new Headers(init?.headers ?? request?.headers);
    const body = requestBody(init?.body);

    sent.push({ url, authorization: headers.get("authorization"), body });

    const recording = recordings.find(
      (candidate) =>
        candidate.request.method === method &&
        candidate.request.url === url &&
        isEqual(candidate.request.body, body)
    );

    if (recording === undefined) {
      throw new Error(
        `No recording answers ${method} ${url} for model ${modelNameOf(body)}. ` +
          `The sent body was ${JSON.stringify(body)}. Add a recording with this ` +
          "request beside the test, then let the owner run the refresh script " +
          "(packages/core/tools/refresh-model-recordings.ts)."
      );
    }

    return responseFromRecording(recording);
  };

  return Object.assign(transport, { sent });
}

function requestBody(body: BodyInit | null | undefined): JsonValue | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the transport seam's body is a JSON string
  if (typeof body !== "string") {
    return undefined;
  }

  return jsonValueSchema.parse(JSON.parse(body));
}

/* oxlint-disable anti-slop/no-runtime-typeof -- the sent request body is caller JSON, not a parsed domain value */
function isJsonObject(
  value: JsonValue
): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function modelNameOf(body: JsonValue | undefined): string {
  if (body === undefined || !isJsonObject(body)) {
    return "unknown";
  }

  return typeof body.model === "string" ? body.model : "unknown";
}
/* oxlint-enable anti-slop/no-runtime-typeof */
