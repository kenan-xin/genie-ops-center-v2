import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { ComponentType } from "react";
import { z } from "zod";

import { implementModule } from "../../rpc/implement-module.ts";
import { oc } from "../../rpc/index.ts";
import { definePage, type Module } from "../module.ts";

const fixtureRecord = pgTable("fixture_record", {
  id: uuid("id").primaryKey(),
  label: text("label").notNull(),
});

const WorkspacePage: ComponentType = () => null;

const AdminPage: ComponentType = () => null;

const configurationSchema = z.object({
  title: z.string().default("Fixture"),
  pageSize: z.number().int().min(1).max(100).default(20),
  enabled: z.boolean().default(false),
  mode: z.enum(["basic", "advanced"]).default("basic"),
  tags: z.array(z.string()).default([]),
});

/** A contract with one routed read and the router core builds from it, for the given module id. */
export function fixtureApi(id: string) {
  const contract = {
    records: {
      list: oc
        .route({ method: "GET", path: `/${id}/records` })
        .input(z.object({ limit: z.number().optional() })),
    },
  };

  const os = implementModule(id, contract);

  return {
    contract,
    router: os.router({ records: { list: os.records.list.handler(() => []) } }),
  };
}

const fixture = fixtureApi("fixture");

/**
 * A module declaration that exercises every point of the contract. It is a contract fixture:
 * it lives beside the tests that use it and is never exported from a public entry point.
 */
export const validModule = {
  identity: { id: "fixture", displayName: "Fixture", version: "0.0.0" },

  schema: {
    tables: { fixtureRecord },
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_fixture",
  },

  contract: fixture.contract,

  router: fixture.router,

  permissions: [
    { key: "fixture:read", label: "Read fixture records" },
    { key: "fixture:use", label: "Use the fixture workspace" },
    { key: "fixture:admin", label: "Administer the fixture" },
  ],

  recordTypes: [
    {
      type: "fixture_record",
      resolve: async (_ctx, id: string) => ({
        label: `Fixture record ${id}`,
        path: `/fixture/${id}`,
      }),
    },
  ],

  defaultRoles: [{ name: "Fixture user", permissions: ["fixture:use"] }],

  navigation: {
    pinned: [
      {
        id: "fixture-home",
        label: "Fixture",
        path: "/fixture",
        surface: "workspace",
        requiredPermission: "fixture:use",
      },
      {
        id: "fixture-archive",
        label: "Archive",
        path: "/fixture/archive",
        surface: "workspace",
        requiredPermission: "fixture:use",
      },
      {
        id: "fixture-admin",
        label: "Fixture settings",
        path: "/admin/fixture",
        surface: "admin",
        requiredPermission: "fixture:admin",
      },
    ],
    entries: [
      {
        id: "fixture-home",
        label: "Fixture",
        path: "/fixture",
        surface: "workspace",
        requiredPermission: "fixture:use",
      },
      {
        id: "fixture-archive",
        label: "Archive",
        path: "/fixture/archive",
        surface: "workspace",
        requiredPermission: "fixture:use",
      },
      {
        id: "fixture-admin",
        label: "Fixture settings",
        path: "/admin/fixture",
        surface: "admin",
        requiredPermission: "fixture:admin",
      },
    ],
  },

  pages: {
    workspace: [
      definePage({
        path: "/fixture",
        permission: "fixture:use",
        component: WorkspacePage,
      }),
      definePage({
        path: "/fixture/archive",
        permission: "fixture:use",
        component: WorkspacePage,
      }),
    ],
    admin: [
      definePage({
        path: "/admin/fixture",
        permission: "fixture:admin",
        component: AdminPage,
      }),
    ],
  },

  categoryAssignment: {
    listAssignable: async () => [],
    assign: async () => {},
    clear: async () => {},
  },

  configuration: {
    schema: configurationSchema,
    section: { id: "fixture", title: "Fixture" },
    fields: {
      title: { id: "title", title: "Title" },
      pageSize: { id: "pageSize", title: "Page size" },
      enabled: { id: "enabled", title: "Enabled" },
      mode: { id: "mode", title: "Mode" },
      tags: { id: "tags", title: "Tags" },
    },
  },

  events: [
    {
      name: "fixture.record.created",
      version: 1,
      payload: z.object({ id: z.string() }),
    },
  ],

  // Empty on purpose: `validate.test.ts` adds provisions per case, and
  // `module.test-d.ts` holds the type assertion that an invented name is refused.
  capabilities: [],

  jobs: [
    { name: "fixture.cleanup", schedule: "0 3 * * *", handler: async () => {} },
  ],

  inboundEndpoints: [
    { path: "/fixture/hooks", handle: async () => new Response("ok") },
  ],

  integrationKinds: ["webhook"],

  contentSecurityPolicy: {
    frameOrigins: async () => ["https://embed.fixture.example.com"],
  },

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
