import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import type { ModelRecording } from "./model-transports.ts";
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
