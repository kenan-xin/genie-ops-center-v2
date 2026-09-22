import type { Module } from "@genie/core";
import { initTRPC } from "@trpc/server";

/**
 * A module whose frame-origin provider resolves only invalid origins (AC-25,
 * invalid provider): a wildcard, a scheme, a non-https origin, and a string
 * that is not an origin at all. A fixture template like `failing-viewer`: it
 * exists only inside the disposable fixture build context. Its policy must stay
 * the deny baseline — every invalid contribution is dropped, never normalized
 * into an allowance.
 */
const invalidViewerModule = {
  identity: {
    id: "invalid-viewer",
    displayName: "Invalid Viewer Fixture",
    version: "0.0.0",
  },

  schema: {
    tables: {},
    migrations: () => [],
    migrationsTable: "invalid_viewer_migrations",
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
    frameOrigins: async () => [
      "*",
      "https:",
      "http://insecure.example",
      "not-an-origin",
    ],
  },

  tests: { presets: [] },
} satisfies Module;

export { invalidViewerModule };
