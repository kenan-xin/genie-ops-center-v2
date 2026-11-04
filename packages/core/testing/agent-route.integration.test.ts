import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/errors/index.ts";
import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import {
  appendMessage,
  createOwnSession,
  handleAgentChat,
  readOwnSession,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import {
  removeIntegrationKey,
  storeIntegrationKey,
} from "../src/services/integrations/keys.ts";
import {
  CORE_MODEL_RECORDINGS,
  type DisposableDeployment,
  type JsonValue,
  agentRequest,
  insertPersonWith,
  insertUser,
  markSetupDone,
  readAgentReply,
  startDisposableDeployment,
  useModelTransport,
  useRecordedModel,
  writeModelConnection,
} from "./index.ts";

/**
 * The agent route's refusals (Spec 7 R-40, R-41, R-42, R-18, P8), against a real Postgres. Each one
 * rejects before the stream starts, stores nothing and sends no model request.
 */
let deployment: DisposableDeployment;

let recorded: ReturnType<typeof useRecordedModel>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([]);
  await markSetupDone(deployment.context);
  await writeModelConnection(deployment.context, {
    allowed: ["openai/gpt-6.1-terra", "anthropic/claude-opus-5.5"],
    chat: "openai/gpt-6.1-terra",
    document: "anthropic/claude-opus-5.5",
    reportingDate: "2026-10-27",
  });
  // No recording answers a refused request, and `sent` still records it.
  recorded = useRecordedModel(deployment.context, CORE_MODEL_RECORDINGS);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

function contextOf(
  userId: string | undefined,
  authenticated = true
): ModuleRequestContext {
  const tenant = deployment.context;

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated }),
  };
}

const person = async (permissions: readonly string[]) =>
  contextOf((await insertPersonWith(deployment.context, permissions)).userId);

const asker = () => person(["core:ask:use"]);

function body(
  overrides: Readonly<Record<string, JsonValue>> = {},
  parts: readonly JsonValue[] = [{ type: "text", text: "What can you do?" }]
) {
  return {
    sessionId: randomUUID(),
    message: { id: "client-message-1", role: "user", parts },
    ...overrides,
  };
}

/** The model key is read on every request; the settings stay cached, so only the key changes. */
async function withoutKey<T>(read: () => Promise<T>): Promise<T> {
  const actorUserId = await insertUser(deployment.context);

  await removeIntegrationKey(deployment.context, {
    name: "model-provider",
    actorUserId,
  });

  try {
    return await read();
  } finally {
    await storeIntegrationKey(deployment.context, {
      name: "model-provider",
      value: "sk-or-v1-recorded-model-000000000000000000",
      actorUserId,
    });
  }
}

/** The refusal's catalogue code, or what the route did instead. */
async function refusal(
  ctx: ModuleRequestContext,
  payload: JsonValue
): Promise<string> {
  try {
    await handleAgentChat(ctx, agentRequest(payload), { logError: () => {} });

    return "streamed";
  } catch (error) {
    return error instanceof AppError
      ? error.code
      : `not an AppError: ${String(error)}`;
  }
}

const sseLine = (event: JsonValue) => `data: ${JSON.stringify(event)}\n\n`;

/**
 * A model that sends the first event of the recorded "Hello!" stream at once and the rest only
 * after `release`, so a test reads the route while the model still answers.
 */
function heldModel() {
  const recording: { response: { events: readonly JsonValue[] } } = JSON.parse(
    readFileSync(
      join(CORE_MODEL_RECORDINGS, "hello-chat-default-stream.json"),
      "utf8"
    )
  );

  const [first, ...rest] = recording.response.events;

  const { promise: held, resolve: release } = Promise.withResolvers<void>();

  useModelTransport(deployment.context, {
    transport: async (_input, init) =>
      new Response(
        new ReadableStream<string>({
          async start(controller) {
            controller.enqueue(sseLine(first ?? null));
            await Promise.race([
              held,
              new Promise((resolve) =>
                init?.signal?.addEventListener("abort", resolve)
              ),
            ]);

            if (init?.signal?.aborted)
              return controller.error(init.signal.reason);

            for (const event of rest) controller.enqueue(sseLine(event));

            controller.enqueue("data: [DONE]\n\n");
            controller.close();
          },
        }).pipeThrough(new TextEncoderStream()),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      ),
  });

  return { release: () => release() };
}

/** Reads the route's chunks up to the first word, and answers the reader to go on with. */
async function readToFirstWord(response: Response) {
  if (response.body === null) throw new Error("The agent reply has no body.");

  const reader = parseJsonEventStream({
    stream: response.body,
    schema: uiMessageChunkSchema,
  }).getReader();

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- the chunks arrive one after another
    const { done, value } = await reader.read();

    if (done) throw new Error("The stream ended before its first word.");

    if (value.success && value.value.type === "text-delta") {
      return { reader, word: value.value.delta };
    }
  }
}

describe("the agent route", () => {
  it("refuses each bad request before the stream starts, and stores and sends nothing", async () => {
    const owner = await asker();

    const ownersSession = randomUUID();

    await createOwnSession(owner, {
      id: ownersSession,
      title: "The owner's chat",
      modelId: "openai/gpt-6.1-terra",
    });

    const retiring = await asker();

    const retiredSession = randomUUID();

    await createOwnSession(retiring, {
      id: retiredSession,
      title: "An old chat",
      modelId: "retired/model",
    });

    const breakGlass = contextOf(
      await insertUser(deployment.context, {
        isBreakGlass: true,
        twoFactorEnabled: true,
      })
    );

    const holder = await asker();

    const cases = [
      {
        why: "anonymous",
        send: () => refusal(contextOf(undefined, false), body()),
        code: "unauthenticated",
      },
      {
        why: "no core:ask:use",
        send: async () => refusal(await person([]), body()),
        code: "forbidden",
      },
      {
        why: "the break-glass account",
        send: () => refusal(breakGlass, body()),
        code: "forbidden",
      },
      {
        why: "no stored key",
        send: () => withoutKey(() => refusal(holder, body())),
        code: "ai-off",
      },
      {
        why: "a body over 64 KB",
        send: () =>
          refusal(
            holder,
            body({}, [{ type: "text", text: "x".repeat(65 * 1024) }])
          ),
        code: "request-too-large",
      },
      {
        why: "a file part",
        send: () =>
          refusal(
            holder,
            body({}, [
              {
                type: "file",
                mediaType: "text/plain",
                url: "data:text/plain;base64,aGk=",
              },
            ])
          ),
        code: "invalid-input",
      },
      {
        why: "two parts",
        send: () =>
          refusal(
            holder,
            body({}, [
              { type: "text", text: "One." },
              { type: "text", text: "Two." },
            ])
          ),
        code: "invalid-input",
      },
      {
        why: "an empty text",
        send: () =>
          refusal(holder, body({}, [{ type: "text", text: "  \n " }])),
        code: "invalid-input",
      },
      {
        why: "a context whose record type is not kebab-case",
        send: () =>
          refusal(
            holder,
            body({ context: { recordType: "Dashboard", recordId: "d-1" } })
          ),
        code: "invalid-input",
      },
      {
        why: "a context whose record id holds a space",
        send: () =>
          refusal(
            holder,
            body({ context: { recordType: "dashboard", recordId: "d 1" } })
          ),
        code: "invalid-input",
      },
      {
        why: "another person's session id",
        send: () => refusal(holder, body({ sessionId: ownersSession })),
        code: "not-found",
      },
      {
        why: "a picked model outside the allowed list",
        send: () =>
          refusal(holder, body({ modelId: "someone/unlisted-model" })),
        code: "model-not-allowed",
      },
      {
        why: "an existing session whose model is no longer allowed",
        send: () => refusal(retiring, body({ sessionId: retiredSession })),
        code: "model-not-allowed",
      },
    ];

    const answers = [];

    // In order: the key removal must not overlap the other requests.
    for (const { why, send } of cases) {
      // oxlint-disable-next-line no-await-in-loop
      answers.push({ why, code: await send() });
    }

    expect(answers).toEqual(cases.map(({ why, code }) => ({ why, code })));

    const sessions = await deployment.context.db.$client.query<{ id: string }>(
      "select id from agent_session order by id"
    );

    expect(sessions.rows.map(({ id }) => id)).toEqual(
      [ownersSession, retiredSession].toSorted()
    );

    const messages = await deployment.context.db.$client.query(
      "select id from agent_message"
    );

    expect(messages.rowCount).toBe(0);
    expect(recorded.sent).toEqual([]);
  });

  it("names the record of a valid context in the system text it sends", async () => {
    const sent = recorded.sent.length;

    // No recording answers this request, so the stream ends in an error after the send.
    await readAgentReply(
      await handleAgentChat(
        await asker(),
        agentRequest(
          body({ context: { recordType: "dashboard", recordId: "d-1" } })
        ),
        { logError: () => {} }
      )
    ).catch(() => undefined);

    expect(recorded.sent).toHaveLength(sent + 1);
    expect(JSON.stringify(recorded.sent.at(-1)?.body)).toContain(
      "The person has the dashboard record d-1 open beside this chat."
    );
  });

  it("streams the first words before the model's answer ends", async () => {
    const model = heldModel();

    try {
      const response = await handleAgentChat(
        await asker(),
        agentRequest(body({}, [{ type: "text", text: "Say hello." }])),
        { logError: () => {} }
      );

      // Next's gzip holds a whole event stream unless the response says no-transform (AG13).
      expect(response.headers.get("cache-control")).toContain("no-transform");

      const { reader, word } = await readToFirstWord(response);

      expect(word).toBe("Hello");

      model.release();
      await reader.cancel();
    } finally {
      model.release();
      recorded = useRecordedModel(deployment.context, CORE_MODEL_RECORDINGS);
    }
  });

  it("keeps the words of a stopped answer", async () => {
    const model = heldModel();

    const ctx = await asker();

    const sessionId = randomUUID();

    const stop = new AbortController();

    try {
      const response = await handleAgentChat(
        ctx,
        new Request(
          agentRequest(
            body({ sessionId }, [{ type: "text", text: "Say hello." }])
          ),
          { signal: stop.signal }
        ),
        { logError: () => {} }
      );

      const { reader } = await readToFirstWord(response);

      // A browser's Stop: the request aborts and the response is no longer read.
      stop.abort();
      await reader.cancel();

      await expect
        .poll(
          async () =>
            (await readOwnSession(ctx, sessionId)).messages
              .find((message) => message.role === "assistant")
              ?.parts.filter((part) => part.type === "text")
              .map((part) => part.text)
              .join(""),
          { timeout: 5000 }
        )
        .toBe("Hello");
    } finally {
      model.release();
      recorded = useRecordedModel(deployment.context, CORE_MODEL_RECORDINGS);
    }
  });

  it("answers the next message after a turn stored a tool call with no result", async () => {
    const ctx = await asker();

    const sessionId = randomUUID();

    await createOwnSession(ctx, {
      id: sessionId,
      title: "Records",
      modelId: "openai/gpt-6.1-terra",
    });
    await appendMessage(ctx, sessionId, {
      role: "user",
      parts: [{ type: "text", text: "Which datasets can I read?" }],
    });
    // What a turn cancelled while its tool ran stores: the call, never its result. The recording
    // The recordings answer only a history without that call.
    await appendMessage(ctx, sessionId, {
      id: randomUUID(),
      role: "assistant",
      parts: [
        {
          type: "tool-list-datasets",
          toolCallId: "call-cancelled",
          state: "input-available",
          input: {},
        },
      ],
    });

    const errors: unknown[] = [];

    const { message } = await readAgentReply(
      await handleAgentChat(
        ctx,
        agentRequest(
          body({ sessionId }, [{ type: "text", text: "Say hello." }])
        ),
        { logError: (cause) => errors.push(cause) }
      )
    );

    expect(errors).toEqual([]);
    expect(message?.parts).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining('greeting = Paragraph("Hello!")'),
      })
    );
  });
});
