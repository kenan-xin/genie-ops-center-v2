/**
 * The module's test-only seam. A test of another package imports the factories for this module's
 * tables from here; the app-facing entry points never carry them (R-39 keeps the factories
 * module-owned, and nothing in a browser or a customer runtime imports them).
 */

export {
  DEMO_PACK,
  type DemoHistoryIds,
  readDemoCsv,
  readDemoJson,
} from "./demo-pack.ts";

export {
  type DemoHistoryCount,
  type DemoHistoryPlan,
  demoReportingDate,
  planDemoHistory,
  seedDemoHistory,
} from "./demo-seed.ts";

export {
  type AllocationRow,
  type CustomerRow,
  type DocumentRow,
  type FieldOriginRow,
  type InvoiceRow,
  type PaymentRow,
  insertAllocation,
  insertCustomer,
  insertDocument,
  insertFieldOrigin,
  insertInvoice,
  insertPayment,
} from "./factories.ts";
