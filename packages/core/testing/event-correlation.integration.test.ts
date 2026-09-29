import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { Module } from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import { withTransaction } from "../src/lib/tenant-context/with-transaction.ts";
import type { EventBus } from "../src/services/event-bus/index.ts";
import { stopJobQueue } from "../src/services/job-queue/index.ts";
import {
  createLogger,
  type RedactingLogger,
} from "../src/services/logging/index.ts";
import { runWorker } from "../src/services/worker/index.ts";
import { startDisposablePostgres } from "./postgres.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration fixtures group contract data and setup together. */

type EventContract<T> = {
  readonly name: string;
  readonly version: number;
  readonly payload: z.ZodType<T>;
};

type EventEnvelope<T> = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly payload: T;
  readonly correlationId: string;
  readonly emittedAt: string;
};

type EventHandler<T> = (
  event: EventEnvelope<T>,
  context: TenantContext
) => Promise<void>;

type Subscription<T> = {
  readonly event: EventContract<T>;
  readonly handler: EventHandler<T>;
  readonly name?: string;
  readonly durable?: boolean;
};

type RuntimeContext = TenantContext & { readonly events: EventBus };

type RuntimeModule = Module & {
  readonly subscriptions: readonly Subscription<Payload>[];
};

type Payload = { id: string };

const moduleId = "event-correlation";

const firstContract: EventContract<Payload> = {
  name: `${moduleId}.first`,
  version: 1,
  payload: z.object({ id: z.string() }),
};
const secondContract: EventContract<Payload> = {
  name: `${moduleId}.second`,
  version: 1,
  payload: z.object({ id: z.string() }),
};
const durableFirstContract: EventContract<Payload> = {
  name: `${moduleId}.durable-first`,
  version: 1,
  payload: z.object({ id: z.string() }),
};
const durableSecondContract: EventContract<Payload> = {
  name: `${moduleId}.durable-second`,
  version: 1,
  payload: z.object({ id: z.string() }),
};
const failingContract: EventContract<Payload> = {
  name: `${moduleId}.failing`,
  version: 1,
  payload: z.object({ id: z.string() }),
};

/** What each handler observed: the scope's current id and the envelope it was handed. */
type Observed = {
  readonly current: string | undefined;
  readonly envelope: string;
};

const fastObserved: Observed[] = [];
const durableObserved: Observed[] = [];

// SAFETY: this fixture supplies the subscription module point under test, exactly like the typed
// event bus suite supplies its own.
const correlationModule = {
  identity: {
    id: moduleId,
    displayName: "Event correlation",
    version: "0.0.0",
  },
  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_event_correlation",
  },
  // SAFETY: this suite exercises event correlation only and never dispatches routes.
  router: {} as Module["router"],
  permissions: [],
  recordTypes: [],
  defaultRoles: [],
  navigation: { pinned: [], entries: [] },
  pages: { workspace: {}, admin: {} },
  events: [
    firstContract,
    secondContract,
    durableFirstContract,
    durableSecondContract,
    failingContract,
  ],
  capabilities: [],
  jobs: [],
  inboundEndpoints: [],
  integrationKinds: [],
  tests: { presets: [] },
  subscriptions: [
    {
      event: durableFirstContract,
      name: "first",
      durable: true,
      handler: async (event, context) => {
        // A worker-side emit: it must keep the id of the request that caused the chain.
        await withTransaction(context, async (tx) => {
          await context.events.emit(tx, durableSecondContract, {
            id: event.payload.id,
          });
        });
      },
    },
    {
      event: durableSecondContract,
      name: "second",
      durable: true,
      handler: async (event, context) => {
        durableObserved.push({
          current: context.correlationScope.current(),
          envelope: event.correlationId,
        });
      },
    },
  ],
} as RuntimeModule;

/** The two fields of a captured line this suite asserts on; the rest of the line is ignored. */
type CapturedLine = {
  readonly msg?: unknown;
  readonly correlationId?: unknown;
};

let databaseUrl = "";
let context: RuntimeContext;
let observer: Client;
let logger: RedactingLogger;
const logLines: CapturedLine[] = [];
let workerAbort: AbortController;
let workerRun: Promise<number> | undefined;
let stopDatabase: (() => Promise<void>) | undefined;

function runtimeContext(value: TenantContext): RuntimeContext {
  // SAFETY: events is the runtime member this suite exercises.
  return value as RuntimeContext;
}

/* oxlint-disable no-await-in-loop -- poll only until the first observed database state. */
async function waitUntil(
  check: () => Promise<boolean>,
  message: string,
  timeoutMs = 20000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(message);
}
/* oxlint-enable no-await-in-loop */

beforeAll(async () => {
  const postgres = await startDisposablePostgres();
  databaseUrl = postgres.url;
  stopDatabase = postgres.stop;

  logger = createLogger(
    { logLevel: "debug", publicUrl: "https://test.example.invalid" },
    {
      write(line: string) {
        try {
          // SAFETY: the redacting logger writes one json line, and the read below touches only the
          // two fields `CapturedLine` names; a parse that fails stays out rather than failing setup.
          logLines.push(JSON.parse(line) as CapturedLine);
        } catch {
          // A non-json write is not a line this suite asserts on.
        }
      },
    }
  );

  context = runtimeContext(
    createTenantContext(
      { DATABASE_URL: databaseUrl, PUBLIC_URL: "https://test.example.invalid" },
      logger,
      [moduleId]
    )
  );
  observer = new Client({ connectionString: databaseUrl });
  await observer.connect();

  // The fast chain: first's handler emits second, and second's handler records what it sees.
  context.events.on(firstContract, async (event, ctx) => {
    await withTransaction(ctx, async (tx) => {
      await ctx.events.emit(tx, secondContract, { id: event.payload.id });
    });
  });
  context.events.on(secondContract, async (event, ctx) => {
    fastObserved.push({
      current: ctx.correlationScope.current(),
      envelope: event.correlationId,
    });
  });
  context.events.on(failingContract, async () => {
    throw new Error("event-correlation failing handler");
  });

  workerAbort = new AbortController();
  workerRun = runWorker({
    source: {
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://test.example.invalid",
    },
    modules: [correlationModule],
    histories: [],
    output: () => {},
    errorOutput: () => {},
    signal: workerAbort.signal,
    shutdownTimeoutMs: 1000,
  });
  void workerRun.catch(() => {});

  await waitUntil(async () => {
    const result = await observer.query<{ present: boolean }>(
      "select to_regclass('public.tenant_module') is not null as present"
    );

    return result.rows[0]?.present === true;
  }, "worker did not apply the core migrations");
  await observer.query(
    `insert into tenant_module (module_id, enabled)
     values ($1, true) on conflict (module_id) do update set enabled = true`,
    [moduleId]
  );

  // The durable subscriptions the worker drains come from the module declaration; the emitter
  // context registers the same list so it sends to the same queues.
  const { registerModuleRuntime } = await import("../src/index.ts");
  registerModuleRuntime(context, [correlationModule]);
});

afterAll(async () => {
  workerAbort?.abort();
  await workerRun?.catch(() => undefined);
  await observer?.end();
  if (context !== undefined) {
    await stopJobQueue(context.jobQueue);
    await context.db.$client.end();
  }
  await stopDatabase?.();
});

describe("event correlation across a request, its handlers and a durable job", () => {
  it("carries the request's correlation id through a fast handler chain", async () => {
    const requestId = crypto.randomUUID();
    const marker = crypto.randomUUID();

    await context.correlationScope.run(requestId, () =>
      withTransaction(context, async (tx) => {
        await context.events.emit(tx, firstContract, { id: marker });
      })
    );

    const observed = fastObserved.at(-1);
    if (observed === undefined)
      throw new Error("the second handler did not run");
    expect(observed.current).toBe(requestId);
    expect(observed.envelope).toBe(requestId);
  });

  it("carries the id through a durable job so a worker-side emit keeps it", async () => {
    const requestId = crypto.randomUUID();
    const marker = crypto.randomUUID();

    await context.correlationScope.run(requestId, () =>
      withTransaction(context, async (tx) => {
        await context.events.emit(tx, durableFirstContract, { id: marker });
      })
    );

    await waitUntil(
      async () => durableObserved.some((entry) => entry.envelope === requestId),
      "the durable handler did not deliver the request's correlation id"
    );
    const observed = durableObserved.at(-1);
    expect(observed?.current).toBe(requestId);
    expect(observed?.envelope).toBe(requestId);
  });

  it("writes the chain's correlation id on the line a handler logs", async () => {
    const requestId = crypto.randomUUID();

    await context.correlationScope.run(requestId, () =>
      withTransaction(context, async (tx) => {
        await context.events.emit(tx, failingContract, {
          id: crypto.randomUUID(),
        });
      })
    );

    await waitUntil(
      async () =>
        logLines.some(
          (line) =>
            line.msg === "fast event handler failed" &&
            line.correlationId === requestId
        ),
      "the handler's log line did not carry the request's correlation id"
    );
  });
});
