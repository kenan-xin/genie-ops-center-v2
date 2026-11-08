import { definePage, type Module } from "@genie/core";
import { capability } from "@genie/core/contracts";

import {
  ANALYTICS_AGENT_INSTRUCTIONS,
  ANALYTICS_AGENT_TOOLS,
} from "./agent-tools.ts";
import { analyticsContract } from "./contract.ts";
import { ANALYTICS_PERMISSIONS } from "./permissions.ts";
import {
  DashboardListPage,
  DashboardPage,
} from "./presentation/module-pages.tsx";
import { analyticsRouter } from "./router.ts";
import { dashboard, MIGRATIONS, MIGRATIONS_TABLE } from "./schema.ts";
import {
  loadDashboardList,
  loadDashboardPage,
} from "./services/pages/loaders.ts";

/** The Dashboards workspace entry and the page of its path (DEC-50). */
const DASHBOARDS_ENTRY = {
  id: "analytics-dashboards",
  label: "Dashboards",
  path: "/m/analytics/dashboards",
  icon: "layout-dashboard",
  surface: "workspace",
  requiredPermission: "analytics:use",
} as const;

/**
 * Every point of the module contract this module declares. Nothing outside the contract is
 * reachable from here: the router reads through `ctx.tenant`, every check goes through
 * `can()`, and no other module is imported.
 */
export const analyticsModule = {
  identity: {
    id: "analytics",
    displayName: "Analytics",
    version: "0.0.0",
    description:
      "Dashboards of live charts over the datasets that modules publish.",
  },

  schema: {
    tables: { dashboard },
    // The declaration, not its result: the SQL read is deferred to bootstrap.
    migrations: MIGRATIONS,
    migrationsTable: MIGRATIONS_TABLE,
  },

  contract: analyticsContract,

  router: analyticsRouter,

  permissions: ANALYTICS_PERMISSIONS,

  // A dashboard is owner-only and not a record type, so no role scope points at one (D7).
  recordTypes: [],

  // Final now: `seedRoles` never rewrites a seeded role, so a key added later would not reach it.
  // No name another module declares, or seeding keeps only one of the two (R-33a).
  defaultRoles: [
    {
      name: "Analytics user",
      description: "Open the Analytics workspace only.",
      permissions: ["analytics:use"],
    },
    {
      name: "Analytics viewer",
      description: "Open your own dashboards.",
      permissions: ["analytics:use", "analytics:read"],
    },
    {
      name: "Analytics editor",
      description: "Build and change your own dashboards.",
      permissions: ["analytics:use", "analytics:read", "analytics:write"],
    },
  ],
  // A dashboard is visible to its owner only, so the editor role reaches no one else's work (A6).
  defaultAccessRole: "Analytics editor",

  navigation: {
    pinned: [],
    entries: [DASHBOARDS_ENTRY],
  },

  // One page per navigation entry, at its path and under its key.
  pages: {
    workspace: [
      definePage({
        path: DASHBOARDS_ENTRY.path,
        permission: DASHBOARDS_ENTRY.requiredPermission,
        load: loadDashboardList,
        component: DashboardListPage,
      }),
      definePage({
        path: `${DASHBOARDS_ENTRY.path}/:id`,
        permission: DASHBOARDS_ENTRY.requiredPermission,
        parent: DASHBOARDS_ENTRY.path,
        load: (ctx, params) => loadDashboardPage(ctx, params.id ?? ""),
        component: DashboardPage,
      }),
    ],
    admin: [],
  },

  events: [],

  capabilities: [
    capability("agent-tools", {
      tools: ANALYTICS_AGENT_TOOLS,
      instructions: ANALYTICS_AGENT_INSTRUCTIONS,
    }),
  ],

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
