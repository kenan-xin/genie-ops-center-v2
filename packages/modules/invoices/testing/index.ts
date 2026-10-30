/**
 * The module's test-only seam. A test of another package imports the factories for this module's
 * tables from here; the app-facing entry points never carry them (R-39 keeps the factories
 * module-owned, and nothing in a browser or a customer runtime imports them).
 */

import { fileURLToPath } from "node:url";

export { withNewId } from "./pdf-fixtures.ts";

/** The absolute path of testing/model-recordings: the hand-written readings of the live uploads. */
export const INVOICES_READING_RECORDINGS = fileURLToPath(
  new URL("model-recordings", import.meta.url)
);

export {
  DEMO_PACK,
  type DemoHistoryIds,
  LIVE_UPLOADS,
  readDemoCsv,
  readDemoFile,
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
