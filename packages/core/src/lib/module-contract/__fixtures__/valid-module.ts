import { initTRPC } from "@trpc/server";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { ComponentType } from "react";
import { z } from "zod";

import type { Module } from "../module.ts";

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

/**
 * A module declaration that exercises every point of the contract. It is a contract fixture:
 * it lives beside the tests that use it and is never exported from a public entry point.
 */
export const validModule = {
  identity: { id: "fixture", displayName: "Fixture", version: "0.0.0" },

  schema: {
    tables: { fixtureRecord },
    migrations: () => [],
    migrationsTable: "fixture_migrations",
  },

  router: initTRPC.create().router({}),

  permissions: [
    { key: "fixture:read", label: "Read fixture records" },
    { key: "fixture:use", label: "Use the fixture workspace" },
    { key: "fixture:admin", label: "Administer the fixture" },
  ],

  recordTypes: [
    {
      type: "fixture_record",
      resolve: async (id: string) => ({
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

  pages: { workspace: { home: WorkspacePage }, admin: { settings: AdminPage } },

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

  // Empty on purpose: a provision names a key of the CapabilityInterfaces
  // registry, and Section 0 registers no capability. `module.test-d.ts` holds
  // the type assertion that an invented name is refused.
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
