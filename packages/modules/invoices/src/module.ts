import type { Module } from "@genie/core";

import { invoicesContract } from "./contract.ts";
import { invoicesRecordTypes } from "./record-types.ts";
import { invoicesRouter } from "./router.ts";
import {
  allocation,
  allocationEvent,
  customer,
  fieldOrigin,
  invoice,
  MIGRATIONS,
  MIGRATIONS_TABLE,
  payment,
  sourceDocument,
} from "./schema.ts";

/**
 * Every point of the module contract this module declares. Nothing outside the contract is
 * reachable from here: the router reads through `ctx.tenant`, every check goes through
 * `can()`, and no other module is imported. The workspace entries and pages arrive with S7-07.
 */
export const invoicesModule = {
  identity: {
    id: "invoices",
    displayName: "Invoices and Payments",
    version: "0.0.0",
    description:
      "Customers, invoices, payments and their links, with the datasets that answer questions about them.",
  },

  schema: {
    tables: {
      customer,
      sourceDocument,
      invoice,
      payment,
      allocation,
      allocationEvent,
      fieldOrigin,
    },
    // The declaration, not its result: the SQL read is deferred to bootstrap.
    migrations: MIGRATIONS,
    migrationsTable: MIGRATIONS_TABLE,
  },

  contract: invoicesContract,

  router: invoicesRouter,

  permissions: [
    { key: "invoices:read", label: "Read invoices, payments and customers" },
    {
      key: "invoices:write",
      label: "Save invoices and payments and change their links",
    },
    { key: "invoices:use", label: "Use the Invoices and Payments workspace" },
  ],

  recordTypes: invoicesRecordTypes,

  // Final now: `seedRoles` never rewrites a seeded role, so a key added later would not reach it.
  defaultRoles: [
    { name: "Invoices and Payments user", permissions: ["invoices:use"] },
    {
      name: "Finance",
      permissions: ["invoices:use", "invoices:read", "invoices:write"],
    },
    { name: "Viewer", permissions: ["invoices:use", "invoices:read"] },
  ],

  navigation: { pinned: [], entries: [] },

  pages: { workspace: [], admin: [] },

  events: [],

  capabilities: [],

  jobs: [],

  inboundEndpoints: [],

  integrationKinds: [],

  /**
   * Typed and empty: this module frames nothing, so it contributes no origin and the policy
   * stays denied (R-15b). A module that needs frames computes its origins here from its own
   * records, through the supplied tenant context.
   */
  contentSecurityPolicy: {
    frameOrigins: async () => [],
  },

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
