/**
 * The module's test-only seam. A test of another package imports the factory for this
 * module's table from here; the app-facing entry points never carry it (R-39 keeps the
 * factories module-owned, and nothing in a browser or a customer runtime imports them).
 */

import { fileURLToPath } from "node:url";

export { AGENT_RECORDS, insertAgentRecords } from "./agent-fixtures.ts";

/** The absolute path of the agent's model recordings on the placeholder datasets. */
export const PLACEHOLDER_AGENT_RECORDINGS = fileURLToPath(
  new URL("model-recordings", import.meta.url)
);

export {
  type PlaceholderRecordRow,
  insertPlaceholderRecord,
} from "./factories.ts";
