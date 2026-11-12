import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";
import { z } from "zod";

import type { JsonValue, ModelRecording } from "./model-transports.ts";
import {
  loadModelRecordings,
  recordingFromResponse,
  replayModelTransport,
  responseFromRecording,
} from "./model-transports.ts";

const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

function recordingFor(name: string, model: string): ModelRecording {
  return {
    name,
    request: { method: "POST", url: CHAT_URL, body: { model, messages: [] } },
    response: { status: 200, body: { id: `answer-${name}` } },
  };
}

function recordingForFolder(name: string): ModelRecording {
  return {
    name,
    request: {
      method: "POST",
      url: CHAT_URL,
      body: { model: `${name}/model` },
    },
    response: { status: 200, body: { id: `answer-${name}` } },
  };
}

const ID_A = "aaaaaaaa-0000-4000-8000-00000000000a";

const ID_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const ID_C = "cccccccc-0000-4000-8000-00000000000c";

const HASH_A = "a".repeat(64);

const HASH_B = "b".repeat(64);

const toolCallEventSchema = z.object({
  choices: z.array(
    z.object({
      delta: z.object({
        tool_calls: z
          .array(z.object({ function: z.object({ arguments: z.string() }) }))
          .optional(),
      }),
    })
  ),
});

function bodyWith(model: string, ...tokens: readonly string[]): JsonValue {
  return {
    model,
    messages: [{ role: "user", content: `Change ${tokens.join(" and ")}.` }],
  };
}

function recordingWith(
  name: string,
  body: JsonValue,
  response: ModelRecording["response"] = { status: 200, body: { answer: name } }
): ModelRecording {
  return { name, request: { method: "POST", url: CHAT_URL, body }, response };
}

function toolCallEvent(fragment: string): JsonValue {
  return {
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [{ index: 0, function: { arguments: fragment } }],
        },
      },
    ],
  };
}

async function send(
  transport: typeof globalThis.fetch,
  body: JsonValue
): Promise<Response> {
  return transport(CHAT_URL, { method: "POST", body: JSON.stringify(body) });
}

async function argumentFragments(response: Response): Promise<string[]> {
  const answer = await recordingFromResponse(response);
  const events = "events" in answer ? answer.events : [];

  return events.flatMap((event) =>
    toolCallEventSchema
      .parse(event)
      .choices.flatMap(({ delta }) => delta.tool_calls ?? [])
      .map((call) => call.function.arguments)
  );
}

it("answers an exact recording before one that matches only by renamed ids", async () => {
  const transport = replayModelTransport([
    recordingWith("renamed", bodyWith("m", ID_A)),
    recordingWith("exact", bodyWith("m", ID_B)),
  ]);

  const answer = await send(transport, bodyWith("m", ID_B));

  expect(await answer.json()).toEqual({ answer: "exact" });
});

it("answers a renamed recording with the sent ids and hashes in its tool call and its body", async () => {
  const transport = replayModelTransport([
    recordingWith("call", bodyWith("call", ID_A, HASH_A), {
      status: 200,
      events: [
        toolCallEvent(JSON.stringify({ deckId: ID_A, expectedHash: HASH_A })),
      ],
    }),
    recordingWith("body", bodyWith("body", ID_A), {
      status: 200,
      body: { id: ID_A },
    }),
  ]);

  const fragments = await argumentFragments(
    await send(transport, bodyWith("call", ID_B, HASH_B))
  );

  expect(JSON.parse(fragments.join(""))).toEqual({
    deckId: ID_B,
    expectedHash: HASH_B,
  });
  expect(await (await send(transport, bodyWith("body", ID_B))).json()).toEqual({
    id: ID_B,
  });
});

it("rewrites an id split over argument fragments, and keeps each fragment's length and the answer's delay", async () => {
  const recorded = [`{"deckId":"${ID_A.slice(0, 10)}`, `${ID_A.slice(10)}"}`];

  const transport = replayModelTransport([
    recordingWith("split", bodyWith("m", ID_A), {
      status: 200,
      chunkDelayMs: 50,
      events: [
        { choices: [{ index: 0, delta: { role: "assistant" } }] },
        ...recorded.map(toolCallEvent),
      ],
    }),
  ]);

  const started = performance.now();

  const fragments = await argumentFragments(
    await send(transport, bodyWith("m", ID_B))
  );

  const elapsedMs = performance.now() - started;

  expect(fragments.join("")).toBe(`{"deckId":"${ID_B}"}`);
  expect(fragments.map((part) => part.length)).toEqual(
    recorded.map((part) => part.length)
  );
  expect(elapsedMs).toBeGreaterThanOrEqual(100);
});

it("refuses a request that two recordings answer only by renaming, and names both", async () => {
  const transport = replayModelTransport([
    recordingWith("one", bodyWith("m", ID_A)),
    recordingWith("two", bodyWith("m", ID_C)),
  ]);

  await expect(send(transport, bodyWith("m", ID_B))).rejects.toThrow(
    /one, two/
  );
});

it("does not match when the sent ids do not pair one to one with the recorded ids", async () => {
  const transport = replayModelTransport([
    recordingWith("two ids", bodyWith("m", ID_A, ID_C)),
  ]);

  await expect(send(transport, bodyWith("m", ID_B, ID_B))).rejects.toThrow(
    /No recording answers/
  );
});

it("refuses a renamed match that moves an id both requests hold, and names the recording", async () => {
  const transport = replayModelTransport([
    recordingWith("swapped", bodyWith("m", ID_A, ID_C)),
  ]);

  await expect(send(transport, bodyWith("m", ID_C, ID_A))).rejects.toThrow(
    /swapped/
  );
});

it("keeps an id both requests hold at its place, and reports each renamed id and hash", async () => {
  const transport = replayModelTransport([
    recordingWith("kept", bodyWith("m", ID_A, HASH_A, ID_C)),
  ]);

  const answer = await send(transport, bodyWith("m", ID_A, HASH_B, ID_B));

  expect(await answer.json()).toEqual({ answer: "kept" });
  expect(transport.sent[0]?.renamed).toEqual([
    { recorded: HASH_A, sent: HASH_B },
    { recorded: ID_C, sent: ID_B },
  ]);
});

it("replays the recording that matches a request, and refuses any other request without its headers", async () => {
  const transport = replayModelTransport([
    recordingFor("first", "first/model"),
    recordingFor("second", "second/model"),
  ]);

  const request = {
    method: "POST",
    headers: { authorization: "Bearer sk-or-v1-replay-secret" },
    body: JSON.stringify({ model: "second/model", messages: [] }),
  };

  const answer = await transport(CHAT_URL, request);

  expect(await answer.json()).toEqual({ id: "answer-second" });
  expect(transport.sent).toEqual([
    {
      url: CHAT_URL,
      authorization: "Bearer sk-or-v1-replay-secret",
      body: { model: "second/model", messages: [] },
    },
  ]);

  const refusal = transport(CHAT_URL, {
    ...request,
    body: JSON.stringify({ model: "third/model", messages: [] }),
  });

  await expect(refusal).rejects.toThrow(/POST/);
  await expect(refusal).rejects.toThrow(/third\/model/);
  await expect(refusal).rejects.toThrow(/record mode/);
  await expect(refusal).rejects.not.toThrow(/sk-or-v1-replay-secret/);
});

it("in record mode sends a request that no recording answers once, saves it, and replays it after", async () => {
  const folder = mkdtempSync(join(tmpdir(), "model-recordings-"));
  const live: unknown[] = [];

  try {
    const transport = replayModelTransport([], {
      directory: folder,
      send: async (_input, init) => {
        live.push(init?.body);

        return Response.json({ id: "answer-live" });
      },
    });

    const request = {
      method: "POST",
      body: JSON.stringify({ model: "live/model", messages: [] }),
    };

    const answers = [
      await (await transport(CHAT_URL, request)).json(),
      await (await transport(CHAT_URL, request)).json(),
    ];

    expect(answers).toEqual([{ id: "answer-live" }, { id: "answer-live" }]);
    expect(live).toHaveLength(1);
    expect(loadModelRecordings(folder)).toEqual([
      {
        name: expect.stringMatching(/^live-[\da-f]{12}$/),
        request: {
          method: "POST",
          url: CHAT_URL,
          body: { model: "live/model", messages: [] },
        },
        response: { status: 200, body: { id: "answer-live" } },
      },
    ]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it("turns a recorded answer into the provider's response and back, streamed and not", async () => {
  const bodyAnswer: ModelRecording["response"] = {
    status: 200,
    body: {
      id: "gen-1",
      choices: [
        { index: 0, message: { role: "assistant", content: "Hello." } },
      ],
      usage: { total_tokens: 5 },
    },
  };

  const streamAnswer: ModelRecording["response"] = {
    status: 200,
    events: [
      {
        id: "gen-2",
        choices: [{ index: 0, delta: { role: "assistant", content: "Hel" } }],
      },
      {
        id: "gen-2",
        choices: [
          { index: 0, delta: { content: "lo" }, finish_reason: "stop" },
        ],
        usage: { total_tokens: 5 },
      },
    ],
  };

  const bodyRecording: ModelRecording = {
    name: "body",
    request: { method: "POST", url: CHAT_URL, body: {} },
    response: bodyAnswer,
  };

  const streamRecording: ModelRecording = {
    name: "stream",
    request: { method: "POST", url: CHAT_URL, body: {} },
    response: streamAnswer,
  };

  const bodyResponse = responseFromRecording(bodyRecording);

  expect(bodyResponse.headers.get("content-type")).toBe("application/json");
  expect(await recordingFromResponse(bodyResponse)).toEqual(bodyAnswer);

  const streamed = responseFromRecording(streamRecording);

  expect(streamed.headers.get("content-type")).toBe("text/event-stream");
  expect(await recordingFromResponse(streamed)).toEqual(streamAnswer);

  const text = await responseFromRecording(streamRecording).text();
  const firstEvent = streamAnswer.events.at(0);

  expect(text.startsWith(`data: ${JSON.stringify(firstEvent)}\n\n`)).toBe(true);
  expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
});

it("loads every recording of a folder in name order, and names a broken file", () => {
  const folder = mkdtempSync(join(tmpdir(), "model-recordings-"));

  try {
    // Written in reverse so a loader that follows the file system answers b first.
    writeFileSync(
      join(folder, "b.json"),
      JSON.stringify(recordingForFolder("b"))
    );
    writeFileSync(
      join(folder, "a.json"),
      JSON.stringify(recordingForFolder("a"))
    );

    expect(loadModelRecordings(folder).map(({ name }) => name)).toEqual([
      "a",
      "b",
    ]);

    writeFileSync(
      join(folder, "c.json"),
      JSON.stringify({
        name: "c",
        request: { method: "POST", body: { model: "c/model" } },
        response: { status: 200, body: { id: "answer-c" } },
      })
    );

    expect(() => loadModelRecordings(folder)).toThrow(/c\.json/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
