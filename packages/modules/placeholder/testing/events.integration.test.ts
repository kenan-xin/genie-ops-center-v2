import { withTransaction, type TenantContext } from "@genie/core";
import type { TenantTransaction } from "@genie/core";
import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import { placeholderModule } from "../src/module.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

type EventContract = {
  readonly name: string;
  readonly version: number;
  readonly payload: ZodType<{ id: string; label: string }>;
};

type EventEnvelope<T> = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly payload: T;
  readonly correlationId: string;
  readonly emittedAt: string;
};

type Events = {
  emit<T>(
    tx: TenantTransaction,
    contract: EventContract,
    payload: T
  ): Promise<void>;
};

type ModuleWithEvents = Omit<typeof placeholderModule, "events"> & {
  readonly events: readonly EventContract[];
  readonly subscriptions: readonly {
    readonly event: EventContract;
    readonly durable?: boolean;
    readonly serializeBy?: (payload: { id: string; label: string }) => string;
    readonly handler: (
      event: EventEnvelope<{ id: string; label: string }>,
      context: TenantContext
    ) => Promise<void>;
  }[];
};

const moduleWithEvents: ModuleWithEvents = {
  ...placeholderModule,
  events: placeholderModule.events,
  subscriptions: Object.getOwnPropertyDescriptor(
    placeholderModule,
    "subscriptions"
  )?.value,
};

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;
let workerAbort: AbortController;
let workerRun: Promise<number> | undefined;

/* oxlint-disable no-await-in-loop -- poll only until the first observed database state. */
async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("placeholder event subscriptions did not finish");
}
/* oxlint-enable no-await-in-loop */

async function registerPlaceholder(): Promise<void> {
  // SAFETY: the new core runtime entry point is accessed dynamically so this test stays runnable before its implementation lands.
  const core = (await import("@genie/core")) as typeof import("@genie/core") & {
    registerModuleRuntime?: (
      context: TenantContext,
      modules: readonly (typeof placeholderModule)[]
    ) => void | Promise<void>;
  };

  if (core.registerModuleRuntime === undefined) {
    throw new Error("registerModuleRuntime is not available yet");
  }

  await core.registerModuleRuntime(deployment.context, [placeholderModule]);
}

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await registerPlaceholder();

  workerAbort = new AbortController();
  const { runWorker } =
    await import("../../../core/src/services/worker/index.ts");
  workerRun = runWorker({
    source: {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    modules: [placeholderModule],
    histories: [],
    output: () => {},
    errorOutput: () => {},
    signal: workerAbort.signal,
    shutdownTimeoutMs: 1000,
  });
  void workerRun.catch(() => {});

  await waitUntil(async () => {
    const result = await deployment.context.db.$client.query<{
      present: boolean;
    }>("select to_regclass('public.tenant_module') is not null as present");

    return result.rows[0]?.present === true;
  });
  await deployment.context.db.$client.query(
    `insert into tenant_module (module_id, enabled)
     values ('placeholder', true)
     on conflict (module_id) do update set enabled = true`
  );
});

afterAll(async () => {
  workerAbort?.abort();
  await workerRun?.catch(() => undefined);
  await deployment?.stop();
});

describe("the placeholder event subscriptions against Testcontainers Postgres", () => {
  it("runs its fast, durable, and serialized effects end to end", async () => {
    const contract = moduleWithEvents.events.find(
      (event) => event.name === "placeholder.record-touched"
    );
    if (contract === undefined)
      throw new Error("placeholder event is not declared");
    expect(contract.version).toBe(1);
    expect(moduleWithEvents.subscriptions).toHaveLength(3);
    expect(
      moduleWithEvents.subscriptions.some(
        (subscription) => subscription.durable === true
      )
    ).toBe(true);
    expect(
      moduleWithEvents.subscriptions.some(
        (subscription) => subscription.serializeBy !== undefined
      )
    ).toBe(true);

    // SAFETY: the event context member is introduced by this ticket; registration succeeded above.
    const bus = deployment.context as TenantContext & {
      readonly events: Events;
    };
    const payload = { id: crypto.randomUUID(), label: "placeholder event" };
    await withTransaction(deployment.context, async (tx) => {
      await bus.events.emit(tx, contract, payload);
    });

    await waitUntil(async () => {
      const result = await deployment.context.db.$client.query<{
        count: number;
      }>("select count(*)::int as count from placeholder_event_effect");

      return result.rows[0]?.count === 3;
    });

    const effects = await deployment.context.db.$client.query(
      "select count(*)::int as count from placeholder_event_effect"
    );
    expect(effects.rows[0]?.count).toBe(3);
  });
});
