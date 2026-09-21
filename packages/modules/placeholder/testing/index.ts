/**
 * The module's test-only seam. A test of another package imports the factory for this
 * module's table from here; the app-facing entry points never carry it (R-39 keeps the
 * factories module-owned, and nothing in a browser or a customer runtime imports them).
 */

export {
  type PlaceholderRecordRow,
  insertPlaceholderRecord,
} from "./factories.ts";
