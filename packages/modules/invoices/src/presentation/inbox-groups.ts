import type { InboxStatus } from "./views.ts";

export type InboxGroup = "needs-you" | "reading" | "done";

/**
 * The inbox group of a status (design review 3.1, choice 13): a status that waits for the person
 * needs them, Reading has its own group, and the rest is done. `duplicate` is the upload answer.
 */
export function inboxGroupOf(status: InboxStatus | "duplicate"): InboxGroup {
  switch (status) {
    case "needs-input":
    case "confirm-split":
    case "no-match":
    case "possible-duplicate":
    case "could-not-read":
      return "needs-you";
    case "reading":
      return "reading";
    default:
      return "done";
  }
}
