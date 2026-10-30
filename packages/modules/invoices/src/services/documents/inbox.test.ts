import { describe, expect, it } from "vitest";

import type { InboxStatus } from "../../contract.ts";
import { inboxStatusOf } from "./inbox.ts";

/** A read payment with no outcome and no record; each case changes what it names. */
const read: Parameters<typeof inboxStatusOf>[0] = {
  readingStatus: "read",
  kind: "payment",
  readingOutcome: null,
  hasRecord: false,
  linkedAutomatically: false,
};

describe("inboxStatusOf", () => {
  it.each<[string, InboxStatus, Partial<typeof read>]>([
    [
      "a document being read",
      "reading",
      { readingStatus: "reading", kind: null },
    ],
    [
      "a document that could not be read",
      "could-not-read",
      { readingStatus: "could-not-read", kind: null },
    ],
    ["a read purchase order", "kept-as-reference", { kind: "purchase-order" }],
    [
      "a payment linked automatically",
      "linked-automatically",
      { hasRecord: true, linkedAutomatically: true },
    ],
    [
      "a saved payment with a stale confirm-split outcome",
      "saved",
      { hasRecord: true, readingOutcome: "confirm-split" },
    ],
    ["a saved invoice", "saved", { kind: "invoice", hasRecord: true }],
    [
      "a split to confirm",
      "confirm-split",
      { readingOutcome: "confirm-split" },
    ],
    ["a payment with no match", "no-match", { readingOutcome: "no-match" }],
    [
      "a possible duplicate",
      "possible-duplicate",
      { readingOutcome: "possible-duplicate" },
    ],
    [
      "a reading with AI off",
      "needs-input",
      { kind: null, readingOutcome: "ai-off" },
    ],
    [
      "a PDF with no text layer",
      "needs-input",
      { kind: null, readingOutcome: "no-text-layer" },
    ],
    ["a read invoice with no outcome", "needs-input", { kind: "invoice" }],
  ])("%s is %s", (_name, status, document) => {
    expect(inboxStatusOf({ ...read, ...document })).toBe(status);
  });
});
