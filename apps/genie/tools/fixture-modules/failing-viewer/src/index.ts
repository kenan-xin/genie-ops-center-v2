import type { Module } from "@genie/core";
import { initTRPC } from "@trpc/server";

/**
 * A module whose frame-origin provider always fails (AC-25, failed provider).
 * This is a fixture template: it is never in the repository's module inventory,
 * and only the disposable fixture build copies it into the staged
 * `packages/modules/` of its own temporary build context. Its policy must stay
 * the deny baseline — a failed provider contributes nothing and never widens.
 */
const failingViewerModule = {
  identity: {
    id: "failing-viewer",
    displayName: "Failing Viewer Fixture",
    version: "0.0.0",
  },

  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "__drizzle_migrations_failing_viewer",
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
    frameOrigins: async () => {
      throw new Error("failing-viewer: the frame origin provider always fails");
    },
  },

  tests: { presets: [] },
} satisfies Module;

export { failingViewerModule };
