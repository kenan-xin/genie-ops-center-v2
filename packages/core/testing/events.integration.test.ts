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
import {
  createEventBus,
  durableEventQueues,
  registerSubscription,
} from "../src/services/event-bus/index.ts";
import { stopJobQueue } from "../src/services/job-queue/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";
import { runWorker } from "../src/services/worker/index.ts";
import { startDisposableDeployment } from "./index.ts";
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
const fastGateContract: EventContract<{ id: string; label: string }> = {
  name: "event-fast-gate.record-touched",
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};
const queueGateContract: EventContract<{ id: string; label: string }> = {
  name: "event-queue-gate.record-touched",
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};

const delivered: EventEnvelope<{ id: string; label: string }>[] = [];
const fastDelivered: EventEnvelope<{ id: string; label: string }>[] = [];
const directFastDelivered: EventEnvelope<{ id: string; label: string }>[] = [];
const serializedStarted: string[] = [];
const serializedFinished: string[] = [];
const workerErrors: string[] = [];
const poisonAttempts = new Map<string, number>();
const deliveryAttempts = new Map<string, number>();
const gateDelivered: string[] = [];
const queueGateDelivered: string[] = [];
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
      const attempt = (deliveryAttempts.get(event.payload.label) ?? 0) + 1;
      deliveryAttempts.set(event.payload.label, attempt);
      delivered.push(event);
      await context.db.$client.query(
        `insert into event_test_effect (handler, event_id, label)
         values ('durable', $1, $2)
         on conflict (handler, event_id) do update set label = excluded.label`,
        [event.id, event.payload.label]
      );
      if (event.payload.label === "retry-once" && attempt === 1) {
        throw new Error("event-test redelivery once");
      }
    },
  },
  {
    event: deliveryContract,
    handler: async (event) => {
      fastDelivered.push(event);
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
      serializedStarted.push(event.payload.label);

      if (
        event.payload.label.startsWith("poison") ||
        (event.payload.label === "retry-first" && attempt === 1)
      ) {
        throw new Error("event-test poison handler");
      }

      delivered.push(event);
      if (event.payload.label === "retry-first") {
        serializedFinished.push(event.payload.label);
      } else if (event.payload.label === "retry-next") {
        serializedFinished.push(event.payload.label);
      }
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

// SAFETY: this fixture substitutes the fast-gate module's own declaration over the base module.
const fastGateModule = {
  ...eventModule,
  identity: {
    id: "event-fast-gate",
    displayName: "Fast gate",
    version: "0.0.0",
  },
  events: [fastGateContract],
  subscriptions: [
    {
      event: fastGateContract,
      handler: async (event: EventEnvelope<Payload>) => {
        gateDelivered.push(event.payload.id);
      },
    },
  ],
} as RuntimeModule;

// SAFETY: this fixture substitutes the queue-gate module's own declaration over the base module.
const queueGateModule = {
  ...eventModule,
  identity: {
    id: "event-queue-gate",
    displayName: "Durable queue gate",
    version: "0.0.0",
  },
  events: [queueGateContract],
  subscriptions: [
    {
      event: queueGateContract,
      durable: true,
      handler: async (event: EventEnvelope<Payload>) => {
        queueGateDelivered.push(event.payload.id);
      },
    },
  ],
} as RuntimeModule;

const abandonContract: EventContract<{ id: string; label: string }> = {
  name: "event-shutdown.abandoned",
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};
const abandonAttempts: string[] = [];

const archiveHandler = async () => {};
const notifyHandler = async () => {};
const byId = (payload: { id: string }) => payload.id;

function queueOf(
  entries: ReturnType<typeof durableEventQueues>,
  handler: () => Promise<void>
): string | undefined {
  return entries.find((entry) => entry.handler === handler)?.queue;
}

// SAFETY: this fixture substitutes the shutdown-abandon module's own declaration over the base
// module, including its own migration ledger name: the omission check maps that name back to the
// module id, so the base module's ledger would read as an installed "event-test" module. Its
// handler never settles, so only the shutdown timeout can move its job.
const abandonModule = {
  ...eventModule,
  identity: {
    id: "event-shutdown",
    displayName: "Event shutdown",
    version: "0.0.0",
  },
  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_event_shutdown",
  },
  events: [abandonContract],
  subscriptions: [
    {
      event: abandonContract,
      serializeBy: (payload: Payload) => payload.id,
      handler: async (event: EventEnvelope<Payload>) => {
        // push returns the attempt number: one and two are retry fodder; from the third on
        // (the queue's default retryLimit is 2) the handler hangs, so only the shutdown
        // timeout can settle the job.
        const attempt = abandonAttempts.push(event.payload.label);
        if (attempt < 3) throw new Error("event-shutdown retry fodder");
        await new Promise<void>(() => {});
      },
    },
  ],
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
      [moduleId, "event-queue-gate"]
    )
  );
  observer = new Client({ connectionString: databaseUrl });
  await observer.connect();
  await registerModules(context, [eventModule, queueGateModule]);

  await context.db.$client.query(`
    create table event_test_effect (
      handler text not null,
      event_id uuid not null,
      label text not null,
      primary key (handler, event_id)
    )
  `);

  context.events.on(deliveryContract, async (event) => {
    directFastDelivered.push(event);
  });

  workerAbort = new AbortController();
  workerRun = runWorker({
    source: {
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://test.example.invalid",
    },
    modules: [eventModule, queueGateModule],
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
    expect(
      directFastDelivered.some((event) => event.payload.id === marker)
    ).toBe(false);
    expect(delivered.some((event) => event.payload.id === marker)).toBe(false);

    const effect = await observer.query(
      "select count(*)::int as count from event_test_effect where label = 'rolled-back'"
    );
    expect(effect.rows[0]?.count).toBe(0);
  });

  it("delivers committed events to fast and pg-boss handlers", async () => {
    const marker = crypto.randomUUID();
    await emit(deliveryContract, { id: marker, label: "committed" });

    await waitUntil(
      async () => delivered.some((event) => event.payload.id === marker),
      "durable event handler did not receive the committed event"
    );

    await waitUntil(async () => {
      const effect = await observer.query<{ count: number }>(
        "select count(*)::int as count from event_test_effect where label = 'committed'"
      );

      return effect.rows[0]?.count === 1;
    }, "durable handler did not record the committed event");

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
    expect(
      directFastDelivered.filter((event) => event.payload.id === marker)
    ).toHaveLength(1);

    const effects = await observer.query<{ count: number }>(
      "select count(*)::int as count from event_test_effect where event_id = $1",
      [envelope.id]
    );
    expect(effects.rows[0]?.count).toBe(1);
    expect(context.capabilities.get("unprovided")).toBeUndefined();
  });

  it("keeps an idempotent effect after a durable handler is redelivered", async () => {
    const marker = crypto.randomUUID();
    await emit(deliveryContract, { id: marker, label: "retry-once" });

    await waitUntil(
      async () => (deliveryAttempts.get("retry-once") ?? 0) >= 2,
      "the durable handler was not redelivered after its first failure"
    );

    const event = delivered.find((entry) => entry.payload.id === marker);
    if (event === undefined)
      throw new Error("redelivered event was not captured");
    const effects = await observer.query<{ count: number; label: string }>(
      "select count(*)::int as count, min(label) as label from event_test_effect where event_id = $1",
      [event.id]
    );
    expect(
      delivered.filter((entry) => entry.payload.id === marker).length
    ).toBeGreaterThanOrEqual(2);
    expect(effects.rows[0]?.label).toBe("retry-once");
    expect(effects.rows[0]?.count).toBe(1);
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

  it("runs eight serialized events emitted in one transaction in emission order", async () => {
    const key = crypto.randomUUID();
    await withTransaction(context, async (tx) => {
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-1",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-2",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-3",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-4",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-5",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-6",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-7",
      });
      await context.events.emit(tx, serializedContract, {
        id: key,
        label: "batch-8",
      });
    });

    await waitUntil(
      async () =>
        [
          "batch-1",
          "batch-2",
          "batch-3",
          "batch-4",
          "batch-5",
          "batch-6",
          "batch-7",
          "batch-8",
        ].every((label) => serializedFinished.includes(label)),
      "same-transaction serialized events did not finish"
    );
    expect(
      serializedStarted.filter((label) => label.startsWith("batch-"))
    ).toEqual([
      "batch-1",
      "batch-2",
      "batch-3",
      "batch-4",
      "batch-5",
      "batch-6",
      "batch-7",
      "batch-8",
    ]);
  });

  it("keeps later serialized jobs in key order after one delivery fails once", async () => {
    const key = crypto.randomUUID();
    await emit(poisonContract, { id: key, label: "retry-first" });
    await emit(poisonContract, { id: key, label: "retry-next" });

    await waitUntil(
      async () => serializedFinished.includes("retry-next"),
      "the serialized retry or its later same-key job did not finish"
    );
    expect(poisonAttempts.get("retry-first")).toBeGreaterThanOrEqual(2);
    expect(
      serializedStarted.filter((label) =>
        ["retry-first", "retry-next"].includes(label)
      )
    ).toEqual(["retry-first", "retry-first", "retry-next"]);
    expect(
      serializedFinished.filter((label) =>
        ["retry-first", "retry-next"].includes(label)
      )
    ).toEqual(["retry-first", "retry-next"]);
  });

  it("refuses direct durable subscriptions", async () => {
    const isolated = runtimeContext(
      createTenantContext(
        {
          DATABASE_URL: databaseUrl,
          PUBLIC_URL: "https://test.example.invalid",
        },
        silentLogger(),
        []
      )
    );
    const contract = {
      name: "core.direct-registration-check",
      version: 1,
      payload: z.object({ id: z.string(), label: z.string() }),
    };
    try {
      expect(() =>
        isolated.events.on(contract, async () => {}, { durable: true })
      ).toThrow();
    } finally {
      await stopJobQueue(isolated.jobQueue);
      await isolated.db.$client.end();
    }
  });

  it("refuses direct serialized subscriptions", async () => {
    const isolated = runtimeContext(
      createTenantContext(
        {
          DATABASE_URL: databaseUrl,
          PUBLIC_URL: "https://test.example.invalid",
        },
        silentLogger(),
        []
      )
    );
    const contract = {
      name: "core.direct-serialized-registration-check",
      version: 1,
      payload: z.object({ id: z.string(), label: z.string() }),
    };

    try {
      expect(() =>
        isolated.events.on(contract, async () => {}, {
          serializeBy: (payload) => payload.id,
        })
      ).toThrow();
    } finally {
      await stopJobQueue(isolated.jobQueue);
      await isolated.db.$client.end();
    }
  });

  it("refuses event emission outside withTransaction even without a fast subscriber", async () => {
    await expect(
      context.db.transaction(async (tx) => {
        await context.events.emit(tx, poisonContract, {
          id: crypto.randomUUID(),
          label: "raw-transaction",
        });
      })
    ).rejects.toThrow();
  });

  it("does not dispatch a fast event after its savepoint rolls back", async () => {
    const marker = crypto.randomUUID();
    await withTransaction(context, async (tx) => {
      await expect(
        tx.transaction(async (savepoint) => {
          await context.events.emit(savepoint, deliveryContract, {
            id: marker,
            label: "savepoint-rolled-back",
          });
          throw new Error("rollback savepoint");
        })
      ).rejects.toThrow("rollback savepoint");
    });

    expect(fastDelivered.some((event) => event.payload.id === marker)).toBe(
      false
    );
    expect(
      directFastDelivered.some((event) => event.payload.id === marker)
    ).toBe(false);
  });

  it("does not run a disabled module fast subscription and runs it after enable", async () => {
    const source = {
      DATABASE_URL: databaseUrl,
      PUBLIC_URL: "https://test.example.invalid",
    };
    const disabled = runtimeContext(
      createTenantContext(source, silentLogger(), ["event-fast-gate"])
    );
    try {
      await registerModules(disabled, [fastGateModule]);
      await disabled.db.$client.query(
        `insert into tenant_module (module_id, enabled) values ('event-fast-gate', false)
         on conflict (module_id) do update set enabled = false`
      );
      const disabledId = crypto.randomUUID();
      await withTransaction(disabled, async (tx) => {
        await disabled.events.emit(tx, fastGateContract, {
          id: disabledId,
          label: "disabled",
        });
      });
      expect(gateDelivered).not.toContain(disabledId);
    } finally {
      await stopJobQueue(disabled.jobQueue);
      await disabled.db.$client.end();
    }

    await observer.query(
      "update tenant_module set enabled = true where module_id = 'event-fast-gate'"
    );
    const enabled = runtimeContext(
      createTenantContext(source, silentLogger(), ["event-fast-gate"])
    );
    try {
      await registerModules(enabled, [fastGateModule]);
      const enabledId = crypto.randomUUID();
      await withTransaction(enabled, async (tx) => {
        await enabled.events.emit(tx, fastGateContract, {
          id: enabledId,
          label: "enabled",
        });
      });
      expect(gateDelivered.filter((id) => id === enabledId)).toHaveLength(1);
    } finally {
      await stopJobQueue(enabled.jobQueue);
      await enabled.db.$client.end();
    }
  });

  it("keeps a module-owned durable event queued while its module is disabled", async () => {
    await observer.query(
      `insert into tenant_module (module_id, enabled) values ('event-queue-gate', false)
       on conflict (module_id) do update set enabled = false`
    );
    const marker = crypto.randomUUID();
    await emit(queueGateContract, {
      id: marker,
      label: "module-disabled-queue",
    });

    await waitUntil(async () => {
      const result = await observer.query<{ state: string }>(
        "select state from pgboss.job where data::text like $1 limit 1",
        [`%${marker}%`]
      );

      return result.rows[0]?.state === "created";
    }, "module-owned event job was not enqueued while disabled");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(queueGateDelivered).not.toContain(marker);
  });

  it("does not duplicate subscriptions when runtime registration repeats", async () => {
    let refused = false;
    try {
      await registerModules(context, [eventModule]);
    } catch {
      refused = true;
    }
    const marker = crypto.randomUUID();
    await emit(deliveryContract, {
      id: marker,
      label: "after-second-registration",
    });
    await waitUntil(
      async () => fastDelivered.some((event) => event.payload.id === marker),
      "the fast event was not delivered"
    );
    if (refused) return;
    expect(
      fastDelivered.filter((event) => event.payload.id === marker)
    ).toHaveLength(1);
  });

  it("logs each serialized dead-letter move promptly with its blocked key", async () => {
    const key = crypto.randomUUID();
    await emit(poisonContract, { id: key, label: "poison-first" });
    await emit(poisonContract, { id: key, label: "later-same-key" });

    await waitUntil(
      async () =>
        workerErrors.some(
          (line) => /dead.?letter/i.test(line) && line.includes(key)
        ) && (poisonAttempts.get("poison-first") ?? 0) > 0,
      "the exhausted job was not promptly logged with its blocked key",
      10000
    );
    const firstMoveLogs = workerErrors.filter(
      (line) => /dead.?letter/i.test(line) && line.includes(key)
    );
    expect(firstMoveLogs).toHaveLength(1);
    expect(poisonAttempts.get("poison-first")).toBeGreaterThan(0);
    expect(
      delivered.some((event) => event.payload.label === "later-same-key")
    ).toBe(false);

    await observer.query(
      "delete from pgboss.job where name = $1 and data::text like $2",
      [
        "event.event-test.event-test.poison.v1.fifo.dead-letter",
        "%poison-first%",
      ]
    );
    const secondKey = crypto.randomUUID();
    await emit(poisonContract, { id: secondKey, label: "poison-second" });
    await waitUntil(
      async () =>
        workerErrors.filter((line) => /dead.?letter/i.test(line)).length >= 2,
      "the second dead-letter move was not logged after operator deletion",
      10000
    );
  });

  it("keeps a module subscription's queue name stable when same-mode subscriptions are reordered", () => {
    const namingContract: EventContract<{ id: string }> = {
      name: "event-naming.record-touched",
      version: 1,
      payload: z.object({ id: z.string() }),
    };
    // `name` is the smallest stable identity a subscription can carry: a handler's identity does
    // not survive a rebuild, so the queue name must come from an explicit name (or the event
    // itself), never from the declaration index.
    const archive = {
      event: namingContract,
      name: "archive",
      serializeBy: (payload: { id: string }) => payload.id,
      handler: archiveHandler,
    };
    const notify = {
      event: namingContract,
      name: "notify",
      serializeBy: (payload: { id: string }) => payload.id,
      handler: notifyHandler,
    };

    const queuesFor = (order: readonly (typeof archive)[]) => {
      const bus = createEventBus({
        jobQueue: context.jobQueue,
        logger: silentLogger(),
        tenant: () => context,
      });
      for (const subscription of order) {
        registerSubscription(bus, "event-naming", subscription);
      }
      return durableEventQueues(bus);
    };

    const declared = queuesFor([archive, notify]);
    const reordered = queuesFor([notify, archive]);

    expect(queueOf(declared, archiveHandler)).toBe(
      queueOf(reordered, archiveHandler)
    );
    expect(queueOf(declared, notifyHandler)).toBe(
      queueOf(reordered, notifyHandler)
    );
    expect(queueOf(declared, archiveHandler)).not.toBe(
      queueOf(declared, notifyHandler)
    );
  });

  it("refuses two subscriptions that resolve to one queue", () => {
    const collisionContract: EventContract<{ id: string }> = {
      name: "event-collision.record-touched",
      version: 1,
      payload: z.object({ id: z.string() }),
    };
    const busFor = () =>
      createEventBus({
        jobQueue: context.jobQueue,
        logger: silentLogger(),
        tenant: () => context,
      });

    // Two unnamed durable subscriptions to one event fall back to one queue name.
    const unnamed = busFor();
    registerSubscription(unnamed, "event-collision", {
      event: collisionContract,
      durable: true,
      handler: archiveHandler,
    });
    expect(() =>
      registerSubscription(unnamed, "event-collision", {
        event: collisionContract,
        durable: true,
        handler: notifyHandler,
      })
    ).toThrow(/already uses/);

    // A durable "fifo.x" and a serialized "x" both join to "....v1.fifo.x".
    const dotted = busFor();
    registerSubscription(dotted, "event-collision", {
      event: collisionContract,
      name: "fifo.x",
      durable: true,
      handler: archiveHandler,
    });
    expect(() =>
      registerSubscription(dotted, "event-collision", {
        event: collisionContract,
        name: "x",
        serializeBy: byId,
        handler: notifyHandler,
      })
    ).toThrow("event.event-collision.event-collision.record-touched.v1.fifo.x");

    // A serialized "x.dead-letter" would drain the dead-letter queue of the serialized "x".
    const deadLetter = busFor();
    registerSubscription(deadLetter, "event-collision", {
      event: collisionContract,
      name: "x",
      serializeBy: byId,
      handler: archiveHandler,
    });
    expect(() =>
      registerSubscription(deadLetter, "event-collision", {
        event: collisionContract,
        name: "x.dead-letter",
        serializeBy: byId,
        handler: notifyHandler,
      })
    ).toThrow(/already uses/);
  });

  it("discards an after-commit entry registered through fn inside a rolled-back savepoint and runs a released one", async () => {
    let rolledBackRan = false;
    let releasedRan = false;

    await withTransaction(context, async (tx, afterCommit) => {
      await expect(
        tx.transaction(async () => {
          afterCommit(() => {
            rolledBackRan = true;
          });
          throw new Error("rollback savepoint after-commit");
        })
      ).rejects.toThrow("rollback savepoint after-commit");

      await tx.transaction(async () => {
        afterCommit(() => {
          releasedRan = true;
        });
      });
    });

    expect(rolledBackRan).toBe(false);
    expect(releasedRan).toBe(true);
  });

  it("logs the dead-letter move when shutdown fails a last-attempt serialized job", async () => {
    // The shutdown worker compiles only the abandon module, and the migration omission check
    // refuses an image that drops an installed module, so this worker takes its own disposable
    // deployment rather than the suite's database.
    const deployment = await startDisposableDeployment([abandonModule]);
    const source = {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    };
    const emitter = runtimeContext(deployment.context);
    await registerModules(emitter, [abandonModule]);
    await emitter.db.$client.query(
      `insert into tenant_module (module_id, enabled) values ('event-shutdown', true)`
    );

    const key = crypto.randomUUID();
    await withTransaction(emitter, async (tx) => {
      await emitter.events.emit(tx, abandonContract, {
        id: key,
        label: "abandon-last",
      });
    });

    const errors: string[] = [];
    const abort = new AbortController();
    const run = runWorker({
      source,
      modules: [abandonModule],
      histories: [],
      output: () => {},
      errorOutput: (line) => errors.push(line),
      signal: abort.signal,
      shutdownTimeoutMs: 400,
    });
    void run.catch(() => {});

    try {
      // The first two attempts fail and are retried; the third fetch is the last attempt
      // (queue default retryLimit 2), and its handler hangs, so only the shutdown timeout
      // can settle the job: fetch claims it, abort abandons it, failAbandoned fails it.
      try {
        await waitUntil(
          async () => abandonAttempts.length >= 3,
          "the serialized job did not reach its last attempt before shutdown"
        );
      } catch (caught) {
        const rows = await emitter.db.$client.query(
          "select name, state, retry_count, retry_limit from pgboss.job where name like 'event.event-shutdown%'"
        );
        const detail = `attempts=${JSON.stringify(abandonAttempts)}; worker=${JSON.stringify(errors)}; jobs=${JSON.stringify(rows.rows)}`;
        throw new Error(
          `${caught instanceof Error ? caught.message : String(caught)}; ${detail}`,
          { cause: caught }
        );
      }
      abort.abort();
      expect(await run).toBe(0);

      // The move itself is failAbandoned's existing work; the R-57 line about it is the pin.
      await waitUntil(
        async () =>
          (
            await emitter.db.$client.query<{ count: number }>(
              "select count(*)::int as count from pgboss.job where name = $1 and data::text like $2",
              [
                "event.event-shutdown.event-shutdown.abandoned.v1.fifo.dead-letter",
                `%${key}%`,
              ]
            )
          ).rows[0]?.count === 1,
        "the abandoned last-attempt job did not reach the dead-letter queue"
      );

      const moves = errors.filter(
        (line) => /dead.?letter/i.test(line) && line.includes(key)
      );
      expect(moves).toHaveLength(1);
      expect(moves[0]).toContain("blocked keys");
    } finally {
      abort.abort();
      await run.catch(() => undefined);
      await stopJobQueue(emitter.jobQueue);
      await deployment.stop();
    }
  });
});
