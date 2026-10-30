import { generateText, streamText } from "ai";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

import {
  type TenantContext,
  createTenantContext,
} from "../src/lib/tenant-context/index.ts";
import {
  removeIntegrationKey,
  storeIntegrationKey,
} from "../src/services/integrations/keys.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import type { ModelTransport } from "../src/services/models/connection.ts";
import { modelFor, modelStatus } from "../src/services/models/index.ts";
import {
  CORE_MODEL_RECORDINGS,
  type DisposableDeployment,
  insertPersonWith,
  loadModelRecordings,
  markSetupDone,
  replayModelTransport,
  startDisposableDeployment,
  useModelTransport,
  useRecordedModel,
} from "./index.ts";

const KEY_A = "sk-or-v1-s7-05-task-5-key-a-000000000000";

const KEY_B = "sk-or-v1-s7-05-task-5-key-b-000000000000";

const CHAT_DEFAULT = "openai/gpt-6.1-terra";

const DOCUMENT_DEFAULT = "anthropic/claude-opus-5.5";

const PROMPT = "Say hello.";

const providerInternals = z.object({
  config: z.object({
    headers: z.custom<() => Record<string, string | undefined>>(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of the provider's private config
      (value) => typeof value === "function"
    ),
  }),
});

let deployment: DisposableDeployment;

let userId: string;

/** Writes the model settings by SQL; a context reads them on its first settings read. */
async function writeModelSettings(
  context: TenantContext,
  models: {
    readonly allowed: readonly string[];
    readonly chat: string | null;
    readonly document: string | null;
  }
): Promise<void> {
  await context.db.$client.query(
    "update tenant_settings set allowed_models = $1::text[], chat_model = $2, document_model = $3",
    [models.allowed, models.chat, models.document]
  );
}

/** Waits `ms`, or rejects with the signal's reason when it aborts first. */
function wait(ms: number, signal: AbortSignal | null | undefined) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** Hands the request to the replay after `ms`, unless the request's signal aborts first. */
function slowly(replay: ModelTransport, ms: number): ModelTransport {
  return async (input, init) => {
    await wait(ms, init?.signal);

    return replay(input, init);
  };
}

/** Passes the first event of the replayed stream, then holds the stream open until the signal aborts. */
function stalling(replay: ModelTransport): ModelTransport {
  return async (input, init) => {
    const answer = await replay(input, init);
    const reader = answer.body?.getReader();
    const signal = init?.signal;

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const first = await reader?.read();

        if (first?.value !== undefined) controller.enqueue(first.value);

        await new Promise((resolve) =>
          signal?.addEventListener("abort", resolve, { once: true })
        );
        await reader?.cancel();
        controller.error(signal?.reason);
      },
    });

    return new Response(body, {
      status: answer.status,
      headers: answer.headers,
    });
  };
}

function recordedReplay() {
  return replayModelTransport(loadModelRecordings(CORE_MODEL_RECORDINGS));
}

beforeAll(async () => {
  deployment = await startDisposableDeployment();

  await markSetupDone(deployment.context);

  ({ userId } = await insertPersonWith(deployment.context, []));

  await writeModelSettings(deployment.context, {
    allowed: [CHAT_DEFAULT, DOCUMENT_DEFAULT],
    chat: CHAT_DEFAULT,
    document: DOCUMENT_DEFAULT,
  });
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

beforeEach(async () => {
  await storeIntegrationKey(deployment.context, {
    name: "model-provider",
    value: KEY_A,
    actorUserId: userId,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the model factory against a real database", () => {
  it("hands out a model that holds no stored key", async () => {
    const model = await modelFor(deployment.context, { task: "chat" });

    // The provider's chat model keeps its settings on a `config` that TypeScript calls private,
    // with a `headers()` that answers the request headers. Any caller can reach both at run time.
    const { config } = providerInternals.parse(model);

    expect(JSON.stringify(model)).not.toContain(KEY_A);
    expect(JSON.stringify(config.headers())).not.toContain(KEY_A);
  });

  it("builds the chat default with the stored key, the allowed host and denied data collection", async () => {
    const { sent } = useRecordedModel(
      deployment.context,
      CORE_MODEL_RECORDINGS
    );

    const { text } = await generateText({
      model: await modelFor(deployment.context, { task: "chat" }),
      prompt: PROMPT,
    });

    expect(text).toBe("Hello!");
    expect(sent).toEqual([
      {
        url: "https://openrouter.ai/api/v1/chat/completions",
        authorization: `Bearer ${KEY_A}`,
        body: expect.objectContaining({
          model: CHAT_DEFAULT,
          provider: { data_collection: "deny" },
        }),
      },
    ]);
  });

  it("picks the model per task, and refuses a chat model outside the allowed list", async () => {
    const { sent } = useRecordedModel(
      deployment.context,
      CORE_MODEL_RECORDINGS
    );

    const rows = [
      [{ task: "chat" }, "Hello!"],
      [
        { task: "chat", modelId: DOCUMENT_DEFAULT },
        "Hello! How can I help you today?",
      ],
      [{ task: "document-reading" }, "Hello! How can I help you today?"],
    ] as const;

    const texts = await Promise.all(
      rows.map(async ([request]) => {
        const { text } = await generateText({
          model: await modelFor(deployment.context, request),
          prompt: PROMPT,
        });

        return text;
      })
    );

    expect(texts).toEqual(rows.map(([, expected]) => expected));

    await expect(
      modelFor(deployment.context, {
        task: "chat",
        modelId: "deepseek/deepseek-v4.1-flash-1017",
      })
    ).rejects.toMatchObject({ code: "model-not-allowed" });
    expect(sent).toHaveLength(rows.length);
  });

  it("a call option cannot turn data collection back on", async () => {
    const { sent } = useRecordedModel(
      deployment.context,
      CORE_MODEL_RECORDINGS
    );

    await expect(
      generateText({
        model: await modelFor(deployment.context, { task: "chat" }),
        prompt: PROMPT,
        providerOptions: {
          openrouter: { provider: { data_collection: "allow" } },
        },
      })
    ).rejects.toThrow("A model request must deny data collection.");
    expect(sent).toHaveLength(0);
  });

  it("stops a slow answer at the timeout after one request", async () => {
    let requests = 0;
    const slow = slowly(recordedReplay(), 5000);

    useModelTransport(deployment.context, {
      transport: (input, init) => {
        requests += 1;

        return slow(input, init);
      },
      timeoutMs: 100,
    });

    const model = await modelFor(deployment.context, { task: "chat" });
    const started = performance.now();

    await expect(generateText({ model, prompt: PROMPT })).rejects.toMatchObject(
      { name: "TimeoutError" }
    );

    const elapsed = performance.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(2000);
    expect(requests).toBe(1);
  });

  it("streams the chat default from its recording", async () => {
    useRecordedModel(deployment.context, CORE_MODEL_RECORDINGS);

    const result = streamText({
      model: await modelFor(deployment.context, { task: "chat" }),
      prompt: PROMPT,
    });

    expect(await result.text).toBe("Hello!");
  });

  it("stops a stalled stream at the timeout", async () => {
    useModelTransport(deployment.context, {
      transport: stalling(recordedReplay()),
      timeoutMs: 100,
    });

    const errors: unknown[] = [];
    const started = performance.now();

    const result = streamText({
      model: await modelFor(deployment.context, { task: "chat" }),
      prompt: PROMPT,
      onError: ({ error }) => {
        errors.push(error);
      },
    });

    // A stream the timeout does not reach stays open; the race turns that into a failed assertion.
    const text = await Promise.race([
      result.text,
      wait(2000, undefined).then(() => "the stream is still open"),
    ]);

    expect(text).toBe("Hello");
    expect(errors).toMatchObject([{ name: "TimeoutError" }]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("reads the key at each call and never the OPENROUTER_API_KEY environment value", async () => {
    const fromEnvironment = "sk-or-v1-from-the-environment";

    vi.stubEnv("OPENROUTER_API_KEY", fromEnvironment);

    const { sent } = useRecordedModel(
      deployment.context,
      CORE_MODEL_RECORDINGS
    );

    const hello = async () =>
      generateText({
        model: await modelFor(deployment.context, { task: "chat" }),
        prompt: PROMPT,
      });

    await hello();

    await storeIntegrationKey(deployment.context, {
      name: "model-provider",
      value: KEY_B,
      actorUserId: userId,
    });

    await hello();

    await removeIntegrationKey(deployment.context, {
      name: "model-provider",
      actorUserId: userId,
    });

    await expect(
      modelFor(deployment.context, { task: "chat" })
    ).rejects.toMatchObject({ code: "ai-off" });
    expect(await modelStatus(deployment.context)).toMatchObject({
      state: "no-key",
    });

    expect(sent.map(({ authorization }) => authorization)).toEqual([
      `Bearer ${KEY_A}`,
      `Bearer ${KEY_B}`,
    ]);
    expect(JSON.stringify(sent)).not.toContain(fromEnvironment);
  });

  it("keeps AI off without a key or without both defaults", async () => {
    const own = await startDisposableDeployment();

    /** A new context, so its first settings read sees the rows written just before. */
    const scenario = async (
      expected: "no-key" | "no-models"
    ): Promise<void> => {
      const context = createTenantContext(
        {
          DATABASE_URL: own.context.env.databaseUrl,
          PUBLIC_URL: own.context.env.publicUrl,
        },
        silentLogger(),
        []
      );

      try {
        await expect(
          modelFor(context, { task: "chat" }),
          expected
        ).rejects.toMatchObject({ code: "ai-off" });
        await expect(
          modelFor(context, { task: "document-reading" }),
          expected
        ).rejects.toMatchObject({ code: "ai-off" });
        expect(await modelStatus(context)).toMatchObject({ state: expected });
      } finally {
        await context.db.$client.end();
      }
    };

    try {
      await markSetupDone(own.context);

      const owner = await insertPersonWith(own.context, []);

      await writeModelSettings(own.context, {
        allowed: [CHAT_DEFAULT, DOCUMENT_DEFAULT],
        chat: CHAT_DEFAULT,
        document: DOCUMENT_DEFAULT,
      });

      await scenario("no-key");

      await storeIntegrationKey(own.context, {
        name: "model-provider",
        value: KEY_A,
        actorUserId: owner.userId,
      });
      await writeModelSettings(own.context, {
        allowed: [],
        chat: null,
        document: null,
      });

      await scenario("no-models");
    } finally {
      await own.stop();
    }
  });
});
