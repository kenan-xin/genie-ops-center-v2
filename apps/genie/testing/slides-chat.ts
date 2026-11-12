/**
 * The chat deck beside the Slides list that the app integration test and the dev e2e share (Spec 7
 * R-42b, R-46, R-56, D12). Ask hands the deck to the Slides agent, which builds it slide by slide.
 * The recordings hold the keys and the message, so a change to either re-keys
 * `slides-handoff-*.json` and `slides-build-*.json`. The five slides follow the
 * demo pack's prompt; each title states the finding its own text, chart or table shows (ruling
 * F15).
 */

/** The keys of the person who chats beside the Slides list. */
export const SLIDES_CHAT_KEYS = [
  "core:ask:use",
  "slides:use",
  "slides:read",
  "slides:write",
  "invoices:use",
  "invoices:read",
] as const;

export const SLIDES_CHAT_MESSAGE =
  "Create five slides: monthly sales, collections, overdue customers, payment behaviour and collection priorities.";

/** The deck that `slides-handoff-2.json` names and `slides-build-3` to `-7` fill. */
export const MONTHLY_DECK = {
  title: "Sales and collections review",
  slideTitles: [
    "Invoiced sales increased each month from May to October.",
    "Collections peaked in August before falling in September and October.",
    "Harbor Foods has the largest overdue balance.",
    "Harbor Foods and Orchid Retail paid all eligible invoices late.",
    "Prioritize Harbor Foods and Orchid Retail for collection.",
  ],
} as const;
