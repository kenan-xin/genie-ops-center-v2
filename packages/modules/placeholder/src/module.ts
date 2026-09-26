import type {
  JobDeclaration,
  Module,
  Subscription,
  TenantContext,
} from "@genie/core";
import { defineEvent } from "@genie/core/contracts";
import { z } from "zod";

import {
  PlaceholderAdminPage,
  PlaceholderWorkspacePage,
} from "./presentation/module-pages.tsx";
import { placeholderRouter } from "./router.ts";
import {
  MIGRATIONS,
  MIGRATIONS_TABLE,
  placeholderEventEffect,
  placeholderRecord,
} from "./schema.ts";

/**
 * A category row this deployment holds. The navigation guard of DEC-51 needs a case for a live
 * category, for no category, and for one that no longer exists, so the three workspace entries
 * below carry one each.
 */
const LIVE_CATEGORY_ID = "4b7f1d52-7f4e-4f0f-93a8-8a8f6f2c1a11";

/** A category id that no longer exists. A module treats it as no category (DEC-51). */
const REMOVED_CATEGORY_ID = "9d0f8b3c-2f5a-4f2e-9d61-0b7a1c4e5f22";

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
 * handler, and a serialized subscription keyed by the record id.
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
    durable: true,
    handler: async (event, context) => {
      await writeEffect("durable", event, context);
    },
  },
  {
    event: recordTouched,
    serializeBy: (payload) => payload.id,
    handler: async (event, context) => {
      await writeEffect("serialized", event, context);
    },
  },
];

const configurationSchema = z.object({
  title: z.string().default("Placeholder"),
  pageSize: z.number().int().min(1).max(100).default(20),
  enabled: z.boolean().default(false),
  mode: z.enum(["basic", "advanced"]).default("basic"),
  tags: z.array(z.string()).default([]),
});

const home = {
  id: "placeholder-home",
  label: "Placeholder",
  path: "/placeholder",
  surface: "workspace",
  requiredPermission: "placeholder:use",
  categoryId: LIVE_CATEGORY_ID,
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
  categoryId: REMOVED_CATEGORY_ID,
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

  router: placeholderRouter,

  permissions: [
    { key: "placeholder:read", label: "Read placeholder records" },
    { key: "placeholder:use", label: "Use the placeholder workspace" },
    { key: "placeholder:admin", label: "Administer the placeholder module" },
  ],

  recordTypes: [
    {
      type: "placeholder-record",
      resolve: async (id: string) => ({
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
    workspace: { home: PlaceholderWorkspacePage },
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
