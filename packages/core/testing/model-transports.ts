import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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
  guardedModelFetch,
  MODEL_PROVIDER_ORIGIN,
  MODEL_REQUEST_TIMEOUT_MS,
  type ModelTransport,
  setModelConnection,
} from "../src/services/models/connection.ts";

export {
  guardedModelFetch,
  MODEL_PROVIDER_ORIGIN,
  MODEL_REQUEST_TIMEOUT_MS,
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
  const transport = replayModelTransport(
    loadModelRecordings(directory),
    liveRecorder(directory)
  );

  useModelTransport(context, { transport });

  return { sent: transport.sent };
}

/** Where record mode saves a request that no recording answers, and how it sends it live. */
export type ModelRecorder = {
  readonly directory: string;
  readonly send: typeof globalThis.fetch;
};

/**
 * The owner's record mode (DEC-55): with `MODEL_RECORDING_KEY` set outside CI, a request that no
 * recording answers goes to the provider through `fetch` as it is now, and its answer is saved in
 * `directory`. So a conversation records each follow-up request that a tool result causes, which
 * the refresh script, replaying saved requests, cannot. Otherwise no recorder.
 */
export function liveRecorder(directory: string): ModelRecorder | undefined {
  const key = process.env.MODEL_RECORDING_KEY;

  if (!key || process.env.CI !== undefined) {
    return undefined;
  }

  return {
    directory,
    send: guardedModelFetch(globalThis.fetch, {
      origin: MODEL_PROVIDER_ORIGIN,
      timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
      apiKey: key,
    }),
  };
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A recorded id or hash that a renamed match replaced with the sent one. */
export type RenamedToken = { readonly recorded: string; readonly sent: string };

export type SentModelRequest = {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: unknown;
  /** Only on a renamed match: each swapped pair, in order of first appearance in the sent body. */
  readonly renamed?: readonly RenamedToken[];
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
    | {
        readonly status: number;
        readonly events: readonly JsonValue[];
        /** Test harness only: the wait between events, so a test can watch a stream (AG14). */
        readonly chunkDelayMs?: number | undefined;
      };
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
    z.object({
      status: z.number().int(),
      events: z.array(jsonValueSchema),
      chunkDelayMs: z.number().int().min(0).optional(),
    }),
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
    chunkDelayInMs: recording.response.chunkDelayMs ?? 0,
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
 * two equal requests get the same answer. When no body matches exactly, a body
 * that matches up to a one-to-one renaming of UUIDs and 64-character hashes
 * answers, with the sent tokens in place of its own (P11-43): a handed-over
 * record has a new id each run, and a deck's hash covers the read time of its
 * figures. Identity rule: a renamed match may not move a token that the sent
 * body also holds, so a swapped or misplaced known id throws, naming the
 * recording, instead of replaying (and record mode never saves it). A rename onto
 * a token that another loaded recording holds throws too, naming both. The entry in
 * `sent` of a renamed match lists each swapped pair in `renamed`. A renamed
 * match cannot tell a consistently wrong fresh id from a right one, so a test
 * that relies on a renamed record id pins it against the id it expects. With a
 * `recorder`, a request that no recording answers is sent live and saved as
 * `live-<hash>.json`, then replayed.
 */
export function replayModelTransport(
  recordings: readonly ModelRecording[],
  recorder?: ModelRecorder
): typeof globalThis.fetch & { readonly sent: readonly SentModelRequest[] } {
  const sent: SentModelRequest[] = [];

  const known = [...recordings];

  const masks = new WeakMap<ModelRecording, MaskedBody>();

  const maskedOf = (recording: ModelRecording): MaskedBody => {
    const masked = masks.get(recording) ?? maskTokens(recording.request.body);

    masks.set(recording, masked);

    return masked;
  };

  const transport: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const url = request?.url ?? String(input);
    const method = init?.method ?? request?.method ?? "GET";
    const headers = new Headers(init?.headers ?? request?.headers);
    const body = requestBody(init?.body);

    const entry = { url, authorization: headers.get("authorization"), body };

    // Pushed before the match, so a refused request still shows its body.
    const index = sent.push(entry) - 1;

    let recording = known.find(
      (candidate) =>
        candidate.request.method === method &&
        candidate.request.url === url &&
        isEqual(candidate.request.body, body)
    );

    if (recording === undefined && body !== undefined) {
      const renamedMatch = renamedRecording(
        known.filter(
          (candidate) =>
            candidate.request.method === method && candidate.request.url === url
        ),
        maskTokens(body),
        maskedOf,
        recordings
      );

      if (renamedMatch !== undefined) {
        recording = renamedMatch.recording;
        sent[index] = { ...entry, renamed: renamedMatch.renamed };
      }
    }

    if (
      recording === undefined &&
      recorder !== undefined &&
      body !== undefined
    ) {
      recording = await recordLive(recorder, url, body);
      known.push(recording);
    }

    if (recording === undefined) {
      throw new Error(
        `No recording answers ${method} ${url} for model ${modelNameOf(body)}. ` +
          `The sent body was ${JSON.stringify(body)}. Let the owner record it ` +
          "in record mode, or refresh the folder with " +
          "packages/core/tools/refresh-model-recordings.ts (packages/core/testing/README.md)."
      );
    }

    return responseFromRecording(recording);
  };

  return Object.assign(transport, { sent });
}

/** A lowercase UUID, or a run of exactly 64 lowercase hex characters (a content hash). */
const TOKEN_PATTERN =
  /[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|(?<![\da-f])[\da-f]{64}(?![\da-f])/g;

/** A body with each token replaced by its kind and its number of first appearance. */
type MaskedBody = {
  readonly masked: JsonValue;
  readonly tokens: readonly string[];
};

function maskTokens(body: JsonValue): MaskedBody {
  const tokens: string[] = [];

  const masked = mapJsonStrings(
    body,
    (text) =>
      text.replace(TOKEN_PATTERN, (token) => {
        const seen = tokens.indexOf(token);

        const number = seen === -1 ? tokens.push(token) - 1 : seen;

        return `<${token.length === 64 ? "hash" : "uuid"}:${number}>`;
      }),
    // Sorted keys number the tokens the same way whatever the key order, as isEqual ignores it.
    true
  );

  return { masked, tokens };
}

function renamedRecording(
  candidates: readonly ModelRecording[],
  sent: MaskedBody,
  maskedOf: (recording: ModelRecording) => MaskedBody,
  // Only the loaded recordings: one that record mode saved holds this run's fresh ids.
  loaded: readonly ModelRecording[]
):
  | { readonly recording: ModelRecording; readonly renamed: RenamedToken[] }
  | undefined {
  if (sent.tokens.length === 0) {
    return undefined;
  }

  const matches = candidates.filter((candidate) =>
    isEqual(maskedOf(candidate).masked, sent.masked)
  );

  if (matches.length > 1) {
    throw new Error(
      `Recordings ${matches.map(({ name }) => name).join(", ")} answer this request only by renaming ids or hashes. ` +
        "Give each a request that differs in more than its ids."
    );
  }

  const [match] = matches;

  if (match === undefined) {
    return undefined;
  }

  // Equal masked bodies number their tokens alike, so this is in sent order.
  const renamed = maskedOf(match)
    .tokens.map((recorded, number) => ({
      recorded,
      sent: sent.tokens[number] ?? recorded,
    }))
    .filter((pair) => pair.recorded !== pair.sent);

  const moved = renamed.find((pair) => sent.tokens.includes(pair.recorded));

  if (moved !== undefined) {
    throw new Error(
      `Recording ${match.name} answers this request only by moving ${moved.recorded}, which the request also sends, to another place. ` +
        "Re-key the recording, or fix the id that the request sends."
    );
  }

  for (const pair of renamed) {
    const holder = loaded.find(
      (other) => other !== match && maskedOf(other).tokens.includes(pair.sent)
    );

    if (holder !== undefined) {
      throw new Error(
        `Recording ${match.name} answers this request only by renaming ${pair.recorded} to ${pair.sent}, which recording ${holder.name} holds. ` +
          "A known id replays in place of a fresh one: fix the id that the request sends, or re-key the recording."
      );
    }
  }

  const renames = new Map(renamed.map((pair) => [pair.recorded, pair.sent]));

  const rename = (text: string): string =>
    text.replace(TOKEN_PATTERN, (token) => renames.get(token) ?? token);

  return {
    recording: { ...match, response: renamedResponse(match.response, rename) },
    renamed,
  };
}

function renamedResponse(
  response: ModelRecording["response"],
  rename: (text: string) => string
): ModelRecording["response"] {
  if ("body" in response) {
    return { ...response, body: mapJsonStrings(response.body, rename) };
  }

  // A tool call's arguments stream in fragments that can split a token, so each
  // call's fragments are joined, renamed, and cut back at the same lengths. A
  // renamed token keeps its length, so every fragment keeps its length.
  const joined = new Map<string, string>();

  for (const event of response.events) {
    mapStreamEvent(
      event,
      (text) => text,
      (call, fragment) => {
        joined.set(call, (joined.get(call) ?? "") + fragment);

        return fragment;
      }
    );
  }

  const renamed = new Map(
    [...joined].map(([call, text]) => [call, rename(text)])
  );

  const cut = new Map<string, number>();

  const events = response.events.map((event) =>
    mapStreamEvent(event, rename, (call, fragment) => {
      const start = cut.get(call) ?? 0;

      cut.set(call, start + fragment.length);

      return (renamed.get(call) ?? fragment).slice(
        start,
        start + fragment.length
      );
    })
  );

  return { ...response, events };
}

async function recordLive(
  recorder: ModelRecorder,
  url: string,
  body: JsonValue
): Promise<ModelRecording> {
  const serialized = JSON.stringify(body);

  const response = await recorder.send(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: serialized,
  });

  // A failed live call saves nothing, so the next run asks again.
  if (!response.ok) {
    throw new Error(
      `Record mode: the provider answered HTTP ${response.status} for model ${modelNameOf(body)}.`
    );
  }

  const name = `live-${createHash("sha256").update(serialized).digest("hex").slice(0, 12)}`;

  const recording: ModelRecording = {
    name,
    request: { method: "POST", url, body },
    response: await recordingFromResponse(response),
  };

  await writeFile(
    join(recorder.directory, `${name}.json`),
    `${JSON.stringify(recording, undefined, 2)}\n`,
    "utf8"
  );

  return recording;
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

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function mapJsonStrings(
  value: JsonValue,
  map: (text: string) => string,
  sortKeys = false
): JsonValue {
  if (typeof value === "string") {
    return map(value);
  }

  if (isJsonArray(value)) {
    return value.map((item) => mapJsonStrings(item, map, sortKeys));
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const keys = Object.keys(value);

  if (sortKeys) {
    keys.sort();
  }

  return Object.fromEntries(
    keys.map((key) => [key, mapJsonStrings(value[key] ?? null, map, sortKeys)])
  );
}

/**
 * Maps each string of a streamed chat completion event. Each tool call's
 * argument fragment goes to `mapArguments` instead, with a key of its choice
 * index and its tool call index.
 */
function mapStreamEvent(
  event: JsonValue,
  map: (text: string) => string,
  mapArguments: (call: string, fragment: string) => string
): JsonValue {
  const choices = isJsonObject(event) ? event.choices : undefined;

  if (!isJsonObject(event) || choices === undefined || !isJsonArray(choices)) {
    return mapJsonStrings(event, map);
  }

  return Object.assign(mapJsonObject(event, map, "choices"), {
    choices: choices.map((choice) => mapChoice(choice, map, mapArguments)),
  });
}

function mapChoice(
  choice: JsonValue,
  map: (text: string) => string,
  mapArguments: (call: string, fragment: string) => string
): JsonValue {
  const delta = isJsonObject(choice) ? choice.delta : undefined;

  const calls =
    delta !== undefined && isJsonObject(delta) ? delta.tool_calls : undefined;

  if (
    !isJsonObject(choice) ||
    delta === undefined ||
    !isJsonObject(delta) ||
    calls === undefined ||
    !isJsonArray(calls)
  ) {
    return mapJsonStrings(choice, map);
  }

  const choiceIndex = String(choice.index);

  return Object.assign(mapJsonObject(choice, map, "delta"), {
    delta: Object.assign(mapJsonObject(delta, map, "tool_calls"), {
      tool_calls: calls.map((call) =>
        mapToolCall(call, map, (callIndex, fragment) =>
          mapArguments(`${choiceIndex}:${callIndex}`, fragment)
        )
      ),
    }),
  });
}

function mapToolCall(
  call: JsonValue,
  map: (text: string) => string,
  mapArguments: (callIndex: string, fragment: string) => string
): JsonValue {
  const named = isJsonObject(call) ? call.function : undefined;

  const fragment =
    named !== undefined && isJsonObject(named) ? named.arguments : undefined;

  if (
    !isJsonObject(call) ||
    named === undefined ||
    !isJsonObject(named) ||
    typeof fragment !== "string"
  ) {
    return mapJsonStrings(call, map);
  }

  return Object.assign(mapJsonObject(call, map, "function"), {
    function: Object.assign(mapJsonObject(named, map, "arguments"), {
      arguments: mapArguments(String(call.index), fragment),
    }),
  });
}

/** Maps each string of an object, without the key `omit`, which the caller fills. */
function mapJsonObject(
  value: { readonly [key: string]: JsonValue },
  map: (text: string) => string,
  omit: string
): { [key: string]: JsonValue } {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== omit)
      .map(([key, item]) => [key, mapJsonStrings(item, map)])
  );
}
/* oxlint-enable anti-slop/no-runtime-typeof */
