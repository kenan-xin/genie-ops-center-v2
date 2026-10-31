/**
 * The module's test-only seam. A test of another package imports the factory for this module's
 * table from here; the app-facing entry points never carry it (R-39 keeps the factories
 * module-owned, and nothing in a browser or a customer runtime imports them).
 */

export { chartDataFixture, frozenElement, insertDeck } from "./factories.ts";

export { readPptx } from "./pptx-reader.ts";

// The store's create with slides, which only the chat tool (Task 8) calls, so the app's real-data
// cases can reach it before that tool exists.
export { createDeck } from "../src/services/decks/store.ts";
