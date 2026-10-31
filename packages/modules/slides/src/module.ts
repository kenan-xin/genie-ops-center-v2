import { definePage, type Module } from "@genie/core";

import { slidesContract } from "./contract.ts";
import { SLIDES_PERMISSIONS } from "./permissions.ts";
import { DeckListPage } from "./presentation/module-pages.tsx";
import { slidesRouter } from "./router.ts";
import { deck, MIGRATIONS, MIGRATIONS_TABLE } from "./schema.ts";

/** The Slides workspace entry and the page of its path (DEC-50). */
const SLIDES_ENTRY = {
  id: "slides-decks",
  label: "Slides",
  path: "/m/slides/decks",
  surface: "workspace",
  requiredPermission: "slides:use",
} as const;

/**
 * Every point of the module contract this module declares. Nothing outside the contract is
 * reachable from here: the router reads through `ctx.tenant`, every check goes through
 * `can()`, and no other module is imported.
 */
export const slidesModule = {
  identity: {
    id: "slides",
    displayName: "Slides",
    version: "0.0.0",
    description:
      "Decks of slides over the datasets that modules publish, presented in the app or exported to PowerPoint.",
  },

  schema: {
    tables: { deck },
    // The declaration, not its result: the SQL read is deferred to bootstrap.
    migrations: MIGRATIONS,
    migrationsTable: MIGRATIONS_TABLE,
  },

  contract: slidesContract,

  router: slidesRouter,

  permissions: SLIDES_PERMISSIONS,

  // A deck is owner-only and not a record type, so no role scope points at one (D14).
  recordTypes: [],

  // Final now: `seedRoles` never rewrites a seeded role, so a key added later would not reach it.
  // No name another module declares, or seeding keeps only one of the two (czjw.26, DEC-50).
  defaultRoles: [
    { name: "Slides user", permissions: ["slides:use"] },
    { name: "Slides viewer", permissions: ["slides:use", "slides:read"] },
    {
      name: "Slides editor",
      permissions: ["slides:use", "slides:read", "slides:write"],
    },
  ],

  navigation: {
    pinned: [SLIDES_ENTRY],
    entries: [SLIDES_ENTRY],
  },

  // One page per navigation entry, at its path and under its key.
  pages: {
    workspace: [
      definePage({
        path: SLIDES_ENTRY.path,
        permission: SLIDES_ENTRY.requiredPermission,
        component: DeckListPage,
      }),
    ],
    admin: [],
  },

  events: [],

  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  /**
   * Typed and empty: this module frames nothing, so it contributes no origin and the policy
   * stays denied (R-15b).
   */
  contentSecurityPolicy: {
    frameOrigins: async () => [],
  },

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
