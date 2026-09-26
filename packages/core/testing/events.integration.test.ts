import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { Module } from "../src/lib/module-contract/module.ts";
import {
  createTenantContext,
  type TenantContext,
} from "../src/lib/tenant-context/index.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../src/lib/tenant-context/with-transaction.ts";
import { stopJobQueue } from "../src/services/job-queue/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
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

type Payload = { id: string; label: string };

type EventHandler<T> = (
  event: EventEnvelope<T>,
  context: TenantContext
) => Promise<void>;

type Subscription<T> = {
  readonly event: EventContract<T>;
  readonly handler: EventHandler<T>;
  readonly durable?: boolean;
  readonly serializeBy?: (payload: T) => string;
};

type EventBus = {
  emit<T>(
    tx: TenantTransaction,
    event: EventContract<T>,
    payload: T
  ): Promise<void>;
  on<T>(
    event: EventContract<T>,
    handler: EventHandler<T>,
    options?: {
      readonly durable?: boolean;
      readonly serializeBy?: (payload: T) => string;
    }
  ): void;
};

type RuntimeContext = TenantContext & {
  readonly events: EventBus;
  readonly capabilities: { get(name: string): (() => void) | undefined };
};

type RuntimeModule = Module & {
  readonly subscriptions: readonly Subscription<Payload>[];
};

const moduleId = "event-test";
const deliveryContract: EventContract<{ id: string; label: string }> = {
  name: `${moduleId}.record-touched`,
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};
const serializedContract: EventContract<{ id: string; label: string }> = {
  name: `${moduleId}.serialized`,
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};
const poisonContract: EventContract<{ id: string; label: string }> = {
  name: `${moduleId}.poison`,
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};

const delivered: EventEnvelope<{ id: string; label: string }>[] = [];
const fastDelivered: EventEnvelope<{ id: string; label: string }>[] = [];
const serializedStarted: string[] = [];
const serializedFinished: string[] = [];
const workerErrors: string[] = [];
const poisonAttempts = new Map<string, number>();
let releaseFirstSerialized: (() => void) | undefined;
let firstSerializedStarted: (() => void) | undefined;

const firstSerialized = new Promise<void>((resolve) => {
  firstSerializedStarted = resolve;
});
const releaseSerialized = new Promise<void>((resolve) => {
  releaseFirstSerialized = resolve;
});

const subscriptions: readonly Subscription<Payload>[] = [
  {
    event: deliveryContract,
    durable: true,
    handler: async (event, context) => {
      delivered.push(event);
      await context.db.$client.query(
        `insert into event_test_effect (handler, event_id, label)
         values ('durable', $1, $2)
         on conflict (handler, event_id) do update set label = excluded.label`,
        [event.id, event.payload.label]
      );
    },
  },
  {
    event: serializedContract,
    serializeBy: (payload) => payload.id,
    handler: async (event) => {
      serializedStarted.push(event.payload.label);

      if (event.payload.label === "same-1") {
        firstSerializedStarted?.();
        await releaseSerialized;
      }

      serializedFinished.push(event.payload.label);
    },
  },
  {
    event: poisonContract,
    serializeBy: (payload) => payload.id,
    handler: async (event) => {
      const attempt = (poisonAttempts.get(event.payload.label) ?? 0) + 1;
      poisonAttempts.set(event.payload.label, attempt);

      if (event.payload.label === "poison") {
        throw new Error("event-test poison handler");
      }

      delivered.push(event);
    },
  },
];

// SAFETY: this fixture supplies the subscriptions module point being implemented in this ticket.
const eventModule = {
  identity: { id: moduleId, displayName: "Event test", version: "0.0.0" },
  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_event_test",
  },
  // SAFETY: worker integration exercises event delivery only and never dispatches routes.
  router: {} as Module["router"],
  permissions: [],
  recordTypes: [],
  defaultRoles: [],
  navigation: { pinned: [], entries: [] },
  pages: { workspace: {}, admin: {} },
  events: [deliveryContract, serializedContract, poisonContract],
  capabilities: [],
  jobs: [],
  inboundEndpoints: [],
  integrationKinds: [],
  tests: { presets: [] },
  subscriptions,
} as RuntimeModule;

let databaseUrl = "";
let context: RuntimeContext;
let observer: Client;
let workerAbort: AbortController;
let workerRun: Promise<number> | undefined;
let stopDatabase: (() => Promise<void>) | undefined;

function runtimeContext(value: TenantContext): RuntimeContext {
  // SAFETY: events and capabilities are the runtime members added by this ticket.
  return value as RuntimeContext;
}

async function registerModules(
  target: TenantContext,
  modules: readonly Module[]
): Promise<void> {
  // SAFETY: dynamic lookup keeps this integration suite executable before the core export lands.
  const core =
    (await import("../src/index.ts")) as typeof import("../src/index.ts") & {
      registerModuleRuntime?: (
        context: TenantContext,
        modules: readonly Module[]
      ) => void | Promise<void>;
    };

  if (core.registerModuleRuntime === undefined) {
    throw new Error("registerModuleRuntime is not available yet");
  }

  await core.registerModuleRuntime(target, modules);
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

async function emit(
  contract: EventContract<{ id: string; label: string }>,
  payload: { id: string; label: string }
): Promise<void> {
  await withTransaction(context, async (tx) => {
    await context.events.emit(tx, contract, payload);
  });
}

beforeAll(async () => {
  const postgres = await startDisposablePostgres();
  databaseUrl = postgres.url;
  stopDatabase = postgres.stop;
  context = runtimeContext(
    createTenantContext(
      { DATABASE_URL: databaseUrl, PUBLIC_URL: "https://test.example.invalid" },
      silentLogger(),
      [moduleId]
    )
  );
  observer = new Client({ connectionString: databaseUrl });
  await observer.connect();
  await registerModules(context, [eventModule]);

  await context.db.$client.query(`
    create table event_test_effect (
      handler text not null,
      event_id uuid not null,
      label text not null,
      primary key (handler, event_id)
    )
  `);

  context.events.on(deliveryContract, async (event) => {
    fastDelivered.push(event);
  });

  workerAbort = new AbortController();
  workerRun = runWorker({
    source: {
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://test.example.invalid",
    },
    modules: [eventModule],
    histories: [],
    output: () => {},
    errorOutput: (line) => workerErrors.push(line),
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

describe("the typed event bus against Testcontainers Postgres", () => {
  it("does not deliver fast or durable work for an event in a rolled-back transaction", async () => {
    const marker = crypto.randomUUID();

    await expect(
      withTransaction(context, async (tx) => {
        await context.events.emit(tx, deliveryContract, {
          id: marker,
          label: "rolled-back",
        });
        throw new Error("rollback event transaction");
      })
    ).rejects.toThrow("rollback event transaction");

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fastDelivered.some((event) => event.payload.id === marker)).toBe(
      false
    );
    expect(delivered.some((event) => event.payload.id === marker)).toBe(false);

    const effect = await observer.query(
      "select count(*)::int as count from event_test_effect where label = 'rolled-back'"
    );
    expect(effect.rows[0]?.count).toBe(0);
  });

  it("delivers committed events to fast and pg-boss handlers and tolerates duplicate handling", async () => {
    const marker = crypto.randomUUID();
    await emit(deliveryContract, { id: marker, label: "committed" });

    await waitUntil(
      async () => delivered.some((event) => event.payload.id === marker),
      "durable event handler did not receive the committed event"
    );

    const envelope = delivered.find((event) => event.payload.id === marker);
    if (envelope === undefined)
      throw new Error("durable handler did not capture its event");
    expect(envelope).toMatchObject({
      name: deliveryContract.name,
      version: deliveryContract.version,
      payload: { id: marker, label: "committed" },
    });
    expect(envelope.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(envelope.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(envelope.emittedAt).toBeTruthy();
    expect(
      fastDelivered.filter((event) => event.payload.id === marker)
    ).toHaveLength(1);

    const handler = subscriptions[0]?.handler;
    if (handler === undefined)
      throw new Error("durable subscription is missing");
    await handler(envelope, context);
    await handler(envelope, context);

    const effects = await observer.query<{ count: number }>(
      "select count(*)::int as count from event_test_effect where event_id = $1",
      [envelope.id]
    );
    expect(effects.rows[0]?.count).toBe(1);
    expect(context.capabilities.get("unprovided")).toBeUndefined();
  });

  it("enqueues durable work in the caller transaction so rollback discards the job", async () => {
    const marker = crypto.randomUUID();

    await expect(
      withTransaction(context, async (tx) => {
        await context.events.emit(tx, deliveryContract, {
          id: marker,
          label: "atomic-durable-marker",
        });

        const inTransaction = await tx.execute(
          // Looking for the unique payload marker proves the pg-boss row is visible on the
          // caller's transaction connection before that transaction commits.
          (await import("drizzle-orm")).sql`
            select id from pgboss.job
            where data::text like ${`%${marker}%`}
          `
        );
        expect(inTransaction.rows).toHaveLength(1);
        throw new Error("rollback queued job");
      })
    ).rejects.toThrow("rollback queued job");

    const jobs = await observer.query(
      "select count(*)::int as count from pgboss.job where data::text like $1",
      [`%${marker}%`]
    );
    expect(jobs.rows[0]?.count).toBe(0);
    expect(delivered.some((event) => event.payload.id === marker)).toBe(false);
  });

  it("runs one serialized key in emission order while another key runs in parallel", async () => {
    const sameKey = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await emit(serializedContract, { id: sameKey, label: "same-1" });
    await firstSerialized;
    await emit(serializedContract, { id: sameKey, label: "same-2" });
    await emit(serializedContract, { id: sameKey, label: "same-3" });
    await emit(serializedContract, { id: otherKey, label: "other" });

    try {
      await waitUntil(
        async () => serializedStarted.includes("other"),
        "a different serialized key did not start while the first key was blocked"
      );
    } finally {
      releaseFirstSerialized?.();
    }
    expect(
      serializedStarted.filter((label) => label.startsWith("same-"))
    ).toEqual(["same-1"]);

    await waitUntil(
      async () => serializedFinished.includes("same-3"),
      "serialized events did not finish after releasing the first handler"
    );
    expect(
      serializedStarted.filter((label) => label.startsWith("same-"))
    ).toEqual(["same-1", "same-2", "same-3"]);
    expect(serializedFinished.indexOf("other")).toBeLessThan(
      serializedFinished.indexOf("same-1")
    );
  });

  it("moves an exhausted serialized job to its dead-letter queue and keeps its key blocked", async () => {
    const key = crypto.randomUUID();
    await emit(poisonContract, { id: key, label: "poison" });
    await emit(poisonContract, { id: key, label: "later-same-key" });

    await waitUntil(
      async () =>
        workerErrors.some((line) => /dead.?letter/i.test(line)) &&
        (poisonAttempts.get("poison") ?? 0) > 0,
      "the exhausted serialized job was not logged as moved to its dead-letter queue",
      90000
    );
    expect(poisonAttempts.get("poison")).toBeGreaterThan(0);
    expect(
      delivered.some((event) => event.payload.label === "later-same-key")
    ).toBe(false);
  });
});
