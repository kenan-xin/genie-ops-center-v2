import type {
  JobDeclaration,
  Module,
  Subscription,
  TenantContext,
} from "@genie/core";
import { defineEvent } from "@genie/core/contracts";
import { z } from "zod";

import { placeholderContract } from "./contract.ts";
import {
  PlaceholderAdminPage,
  placeholderEntryPage,
  PlaceholderWorkspacePage,
} from "./presentation/module-pages.tsx";
import { placeholderRouter } from "./router.ts";
import {
  MIGRATIONS,
  MIGRATIONS_TABLE,
  placeholderEventEffect,
  placeholderRecord,
} from "./schema.ts";

const readRecordJob: JobDeclaration = {
  name: "placeholder.read-record",
  handler: async ({ tenant }) => {
    await tenant.db.select().from(placeholderRecord).limit(1);
  },
};

/** The event the module emits when one of its records is touched (R-61). */
const recordTouched = defineEvent({
  name: "placeholder.record-touched",
  version: 1,
  payload: z.object({ id: z.string(), label: z.string() }),
});

type RecordTouched = { id: string; label: string };

/**
 * Writes one subscription's idempotent effect: a row per handler and event, upserted, so an
 * at-least-once delivery that runs twice leaves the same result (R-55). Each of the three
 * subscriptions writes under its own handler name, which is what proves all three ran.
 */
async function writeEffect(
  handler: "fast" | "durable" | "serialized",
  event: { readonly id: string; readonly payload: RecordTouched },
  context: TenantContext
): Promise<void> {
  await context.db
    .insert(placeholderEventEffect)
    .values({ handler, eventId: event.id, label: event.payload.label })
    .onConflictDoUpdate({
      target: [placeholderEventEffect.handler, placeholderEventEffect.eventId],
      set: { label: event.payload.label },
    });
}

/**
 * The three delivery channels on one event (R-61): a fast in-process handler, a durable pg-boss
 * handler, and a serialized subscription keyed by the record id. The durable and serialized ones
 * carry a stable `name`, which their queue name derives from, so reordering them never reroutes an
 * in-flight job (R-56).
 */
const recordTouchedSubscriptions: readonly Subscription<RecordTouched>[] = [
  {
    event: recordTouched,
    handler: async (event, context) => {
      await writeEffect("fast", event, context);
    },
  },
  {
    event: recordTouched,
    name: "durable",
    durable: true,
    handler: async (event, context) => {
      await writeEffect("durable", event, context);
    },
  },
  {
    event: recordTouched,
    name: "serialized",
    serializeBy: (payload) => payload.id,
    handler: async (event, context) => {
      await writeEffect("serialized", event, context);
    },
  },
];

const configurationSchema = z.object({
  title: z.string().min(1).max(60).default("Placeholder"),
  pageSize: z.number().int().min(1).max(100).default(20),
  enabled: z.boolean().default(false),
  // A labeled enum: each choice shows its title in the settings form (U-4).
  mode: z
    .union([
      z.literal("basic").meta({ title: "Basic" }),
      z.literal("advanced").meta({ title: "Advanced" }),
    ])
    .default("basic"),
  tags: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .max(5)
    .default([]),
});

const home = {
  id: "placeholder-home",
  label: "Placeholder",
  path: "/placeholder",
  surface: "workspace",
  requiredPermission: "placeholder:use",
} as const;

const archive = {
  id: "placeholder-archive",
  label: "Archive",
  path: "/placeholder/archive",
  surface: "workspace",
  requiredPermission: "placeholder:use",
} as const;

const retired = {
  id: "placeholder-retired",
  label: "Retired",
  path: "/placeholder/retired",
  surface: "workspace",
  requiredPermission: "placeholder:use",
} as const;

const settings = {
  id: "placeholder-settings",
  label: "Placeholder settings",
  path: "/admin/placeholder",
  surface: "admin",
  requiredPermission: "placeholder:admin",
} as const;

/**
 * The module every contract test runs against (R-15). It never enters a customer's include
 * list, and it carries no landing flag: Section 0 ships no landing module (DEC-49).
 */
export const placeholderModule = {
  identity: {
    id: "placeholder",
    displayName: "Placeholder",
    version: "0.0.0",
  },

  schema: {
    tables: { placeholderRecord, placeholderEventEffect },
    migrations: MIGRATIONS,
    migrationsTable: MIGRATIONS_TABLE,
  },

  contract: placeholderContract,

  router: placeholderRouter,

  permissions: [
    { key: "placeholder:read", label: "Read placeholder records" },
    { key: "placeholder:use", label: "Use the placeholder workspace" },
    { key: "placeholder:admin", label: "Administer the placeholder module" },
  ],

  recordTypes: [
    {
      type: "placeholder-record",
      resolve: async (_ctx, id: string) => ({
        label: `Placeholder record ${id}`,
        path: `/placeholder/${id}`,
      }),
    },
  ],

  defaultRoles: [
    { name: "Placeholder user", permissions: ["placeholder:use"] },
  ],

  navigation: {
    pinned: [home, archive],
    entries: [home, archive, retired, settings],
  },

  pages: {
    // Each further entry's page key is the last segment of its path, which `/placeholder/[entry]`
    // looks up.
    workspace: {
      home: PlaceholderWorkspacePage,
      archive: placeholderEntryPage(archive.label),
      retired: placeholderEntryPage(retired.label),
    },
    admin: { settings: PlaceholderAdminPage },
  },

  configuration: {
    schema: configurationSchema,
    section: { id: "placeholder", title: "Placeholder" },
    fields: {
      title: { id: "title", title: "Title" },
      pageSize: { id: "pageSize", title: "Page size" },
      enabled: { id: "enabled", title: "Enabled" },
      mode: { id: "mode", title: "Mode" },
      tags: { id: "tags", title: "Tags" },
    },
  },

  events: [recordTouched],

  // Section 0 registers no capability, so a provision cannot name one (DEC-42).
  capabilities: [],

  // The module's three subscriptions to its own event: fast, durable and serialized (R-61).
  subscriptions: recordTouchedSubscriptions,

  // The job the worker's contract test enqueues: it reads through the tenant context it is given,
  // which proves a handler's reads land in the worker's own database (AC-11).
  jobs: [readRecordJob],

  inboundEndpoints: [],

  integrationKinds: [],

  contentSecurityPolicy: {
    frameOrigins: async () => ["https://embed.placeholder.example.com"],
  },

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
