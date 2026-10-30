import { definePage, type Module } from "@genie/core";

import { invoicesContract } from "./contract.ts";
import {
  allocationsDataset,
  customersDataset,
  invoicesDataset,
  paymentsDataset,
} from "./datasets.ts";
import { INVOICES_PERMISSIONS } from "./permissions.ts";
import {
  InvoiceListPage,
  InvoiceRecordPage,
  PaymentListPage,
  PaymentRecordPage,
} from "./presentation/module-pages.tsx";
import { invoicesRecordTypes, RECORD_TYPES } from "./record-types.ts";
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
import { loadInvoiceList, loadPaymentList } from "./services/pages/lists.ts";
import {
  loadInvoiceRecord,
  loadPaymentRecord,
} from "./services/pages/records.ts";

/** The Invoices workspace entry and the page of its path (DEC-50). */
const INVOICES_ENTRY = {
  id: "invoices-invoices",
  label: "Invoices",
  path: "/m/invoices/invoices",
  surface: "workspace",
  requiredPermission: "invoices:use",
} as const;

/** The Payments workspace entry and the page of its path (DEC-50). */
const PAYMENTS_ENTRY = {
  id: "invoices-payments",
  label: "Payments",
  path: "/m/invoices/payments",
  surface: "workspace",
  requiredPermission: "invoices:use",
} as const;

/**
 * Every point of the module contract this module declares. Nothing outside the contract is
 * reachable from here: the router reads through `ctx.tenant`, every check goes through
 * `can()`, and no other module is imported.
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

  permissions: INVOICES_PERMISSIONS,

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

  navigation: {
    pinned: [INVOICES_ENTRY, PAYMENTS_ENTRY],
    entries: [INVOICES_ENTRY, PAYMENTS_ENTRY],
  },

  // One page per navigation entry, at its path and under its key.
  pages: {
    workspace: [
      definePage({
        path: INVOICES_ENTRY.path,
        permission: "invoices:use",
        load: loadInvoiceList,
        component: InvoiceListPage,
      }),
      definePage({
        path: "/m/invoices/invoices/:id",
        permission: "invoices:use",
        record: {
          type: RECORD_TYPES.invoice,
          param: "id",
          read: "invoices:read",
        },
        parent: INVOICES_ENTRY.path,
        load: (ctx, params) => loadInvoiceRecord(ctx, params.id ?? ""),
        component: InvoiceRecordPage,
      }),
      definePage({
        path: PAYMENTS_ENTRY.path,
        permission: "invoices:use",
        load: loadPaymentList,
        component: PaymentListPage,
      }),
      definePage({
        path: "/m/invoices/payments/:id",
        permission: "invoices:use",
        record: {
          type: RECORD_TYPES.payment,
          param: "id",
          read: "invoices:read",
        },
        parent: PAYMENTS_ENTRY.path,
        load: (ctx, params) => loadPaymentRecord(ctx, params.id ?? ""),
        component: PaymentRecordPage,
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
   * stays denied (R-15b). A module that needs frames computes its origins here from its own
   * records, through the supplied tenant context.
   */
  contentSecurityPolicy: {
    frameOrigins: async () => [],
  },

  datasets: [
    invoicesDataset,
    paymentsDataset,
    customersDataset,
    allocationsDataset,
  ],

  tests: { presets: ["unit", "integration", "e2e"] },
} satisfies Module;
