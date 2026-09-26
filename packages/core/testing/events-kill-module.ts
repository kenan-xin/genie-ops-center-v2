import { z } from "zod";

import type { Module } from "../src/lib/module-contract/module.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";

type EventContract = {
  readonly name: string;
  readonly version: number;
  readonly payload: z.ZodType<{ id: string; label: string }>;
};

type EventEnvelope = {
  readonly id: string;
  readonly payload: { id: string; label: string };
};

export const killCaseContract: EventContract = {
  name: "event-kill.record-touched",
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
};

// SAFETY: the new `subscriptions` module point is intentionally part of this test fixture.
export const killCaseModule = {
  identity: {
    id: "event-kill",
    displayName: "Event kill test",
    version: "0.0.0",
  },
  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_event_kill",
  },
  // SAFETY: the worker contract test never dispatches application routes.
  router: {} as Module["router"],
  permissions: [],
  recordTypes: [],
  defaultRoles: [],
  navigation: { pinned: [], entries: [] },
  pages: { workspace: {}, admin: {} },
  events: [killCaseContract],
  capabilities: [],
  jobs: [],
  inboundEndpoints: [],
  integrationKinds: [],
  tests: { presets: [] },
  subscriptions: [
    {
      event: killCaseContract,
      durable: true,
      handler: async (event: EventEnvelope, context: TenantContext) => {
        await context.db.$client.query(
          `insert into event_kill_effect (event_id, label)
           values ($1, $2)
           on conflict (event_id) do update set label = excluded.label`,
          [event.id, event.payload.label]
        );
      },
    },
  ],
} as Module;
