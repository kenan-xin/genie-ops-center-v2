import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError } from "../src/lib/errors/index.ts";
import type { ModuleRequestContext } from "../src/lib/module-contract/module.ts";
import {
  createOwnSession,
  handleAgentChat,
} from "../src/services/agent/index.ts";
import { principalFor } from "../src/services/authorization/grant-reader.ts";
import {
  removeIntegrationKey,
  storeIntegrationKey,
} from "../src/services/integrations/keys.ts";
import {
  type DisposableDeployment,
  type JsonValue,
  agentRequest,
  insertPersonWith,
  insertUser,
  markSetupDone,
  startDisposableDeployment,
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
  // An empty folder: any model request fails, and `sent` still records it.
  recorded = useRecordedModel(
    deployment.context,
    mkdtempSync(join(tmpdir(), "agent-route-"))
  );
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
});
