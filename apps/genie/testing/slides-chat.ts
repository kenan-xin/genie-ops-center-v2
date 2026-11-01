/**
 * The chat deck beside the Slides list that the app integration test and the dev e2e share (Spec 7
 * R-46, R-56, D12). The recorded model requests hold the keys and the message, so a change to
 * either re-records `slides-create-deck-1.json` to `-5.json`. The five slides follow the demo
 * pack's prompt; each title states the finding its own text, chart or table shows (ruling F15).
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

/** The deck that the recorded `slides-create-deck` call of `slides-create-deck-4.json` creates. */
export const MONTHLY_DECK = {
  title: "Sales, collections and payment priorities",
  slideTitles: [
    "Invoiced sales rose each month from May through October.",
    "Collections peaked in August and fell in September and October to date.",
    "Harbor Foods has the largest overdue balance.",
    "Harbor Foods, ABC Trading and Orchid Retail repeatedly paid late.",
    "Prioritize Harbor Foods by balance and Orchid Retail by age.",
  ],
} as const;
