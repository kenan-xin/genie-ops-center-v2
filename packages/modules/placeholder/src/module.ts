import type { Module } from "@genie/core";
import { z } from "zod";

import {
  PlaceholderAdminPage,
  PlaceholderWorkspacePage,
} from "./presentation/module-pages.tsx";
import { placeholderRouter } from "./router.ts";
import { MIGRATIONS, MIGRATIONS_TABLE, placeholderRecord } from "./schema.ts";

/**
 * A category row this deployment holds. The navigation guard of DEC-51 needs a case for a live
 * category, for no category, and for one that no longer exists, so the three workspace entries
 * below carry one each.
 */
const LIVE_CATEGORY_ID = "4b7f1d52-7f4e-4f0f-93a8-8a8f6f2c1a11";

/** A category id that no longer exists. A module treats it as no category (DEC-51). */
const REMOVED_CATEGORY_ID = "9d0f8b3c-2f5a-4f2e-9d61-0b7a1c4e5f22";

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
    tables: { placeholderRecord },
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

  events: [],

  // Section 0 registers no capability, so a provision cannot name one (DEC-42).
  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  contentSecurityPolicy: {
    frameOrigins: async () => ["https://embed.placeholder.example.com"],
  },

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
