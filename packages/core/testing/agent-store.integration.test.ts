import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import {
  type AgentMessage,
  appendMessage,
  createOwnSession,
  findOwnSession,
  listOwnSessions,
  readOwnSession,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import {
  type DisposableDeployment,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "./index.ts";

const MODEL = "openai/gpt-6.1-terra";

let deployment: DisposableDeployment;

let personA: ModuleRequestContext;

let personB: ModuleRequestContext;

async function person(): Promise<ModuleRequestContext> {
  const tenant = deployment.context;
  const { userId } = await insertPersonWith(tenant, []);

  return {
    tenant,
    caller: principalFor({ tenant, modules: [], userId, authenticated: true }),
  };
}

function text(value: string): AgentMessage["parts"] {
  return [{ type: "text", text: value }];
}

async function session(ctx: ModuleRequestContext, title: string) {
  return createOwnSession(ctx, { id: randomUUID(), title, modelId: MODEL });
}

beforeAll(async () => {
  deployment = await startDisposableDeployment();

  await markSetupDone(deployment.context);

  personA = await person();
  personB = await person();
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

describe("the owner-only agent store against a real database", () => {
  it("a person lists only their own sessions, latest message first", async () => {
    const own = await person();
    const other = await person();

    const s1 = await session(own, "First");
    const s2 = await session(own, "Second");
    const s3 = await session(other, "Other");

    await appendMessage(own, s1.id, { role: "user", parts: text("Hello") });

    expect((await listOwnSessions(own)).map(({ id }) => id)).toEqual([
      s1.id,
      s2.id,
    ]);
    expect((await listOwnSessions(other)).map(({ id }) => id)).toEqual([s3.id]);
  });

  it("another person's session answers not-found and stays unchanged", async () => {
    const s1 = await session(personA, "A's chat");

    await appendMessage(personA, s1.id, {
      role: "user",
      parts: text("A's question"),
    });

    const attempts = [
      ["B reads A's session", () => readOwnSession(personB, s1.id)],
      [
        "B appends to A's session",
        () =>
          appendMessage(personB, s1.id, {
            role: "user",
            parts: text("B's words"),
          }),
      ],
      [
        "B creates a session with A's id",
        () =>
          createOwnSession(personB, {
            id: s1.id,
            title: "Taken over",
            modelId: MODEL,
          }),
      ],
      ["A reads a malformed id", () => readOwnSession(personA, "not-a-uuid")],
    ] as const;

    await Promise.all(
      attempts.map(([label, attempt]) =>
        expect(attempt(), label).rejects.toMatchObject({
          name: "AppError",
          code: "not-found",
        })
      )
    );

    // A well-formed id with no row is a new chat, not a refusal: the route creates it.
    expect(await findOwnSession(personA, randomUUID())).toBeUndefined();

    const { session: kept, messages } = await readOwnSession(personA, s1.id);

    expect(kept.title).toBe("A's chat");
    expect(messages.map(({ parts }) => parts)).toEqual([text("A's question")]);
  });

  it("messages keep their order and their parts", async () => {
    const s1 = await session(personA, "Ordered");

    const toolCall: AgentMessage["parts"] = [
      { type: "step-start" },
      {
        type: "tool-query-dataset",
        toolCallId: "call_1",
        state: "output-available",
        input: { dataset: "placeholder.items", query: { limit: 2 } },
        output: {
          rows: [
            { name: "Alpha", amount: 10 },
            { name: "Beta", amount: null },
          ],
          truncated: false,
        },
      },
      { type: "text", text: "Two items." },
    ];

    // The highest uuid on the middle message, so an order by id puts it last on every run.
    const assistantId = "ffffffff-ffff-4fff-bfff-ffffffffffff";

    const sent = [
      { role: "user", parts: text("How many items?") },
      { role: "assistant", parts: toolCall },
      { role: "user", parts: text("Thanks") },
    ] as const;

    for (const message of sent) {
      // oxlint-disable-next-line no-await-in-loop -- the append order is what the test reads back
      await appendMessage(personA, s1.id, { ...message, id: assistantId });
    }

    const { messages } = await readOwnSession(personA, s1.id);

    expect(messages.map(({ role, parts }) => ({ role, parts }))).toEqual(sent);
    expect(messages[1]?.id).toBe(assistantId);
  });
});
