import type { Module } from "@genie/core";
import { initTRPC } from "@trpc/server";

/**
 * A module whose frame-origin provider resolves one valid origin. This is the
 * positive control of the fixture browser run: on the same harness and the same
 * image as the failing and invalid providers, its frame is genuinely permitted,
 * so the denial cases next to it cannot be passed by a broken harness — a route
 * interception that intercepted nothing would light this frame up and fail the
 * denial cases, and an interception that swallowed everything would fail this
 * one.
 */
const permittedViewerModule = {
  identity: {
    id: "permitted-viewer",
    displayName: "Permitted Viewer Fixture",
    version: "0.0.0",
  },

  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "permitted_viewer_migrations",
  },

  router: initTRPC.create().router({}),

  permissions: [],

  recordTypes: [],

  defaultRoles: [],

  navigation: { pinned: [], entries: [] },

  pages: { workspace: {}, admin: {} },

  events: [],

  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  contentSecurityPolicy: {
    frameOrigins: async () => ["https://embed.placeholder.example.com"],
  },

  tests: { presets: [] },
} satisfies Module;

export { permittedViewerModule };
