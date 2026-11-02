import { describe, expect, it } from "vitest";

import { inboxGroupOf } from "./inbox-groups.ts";

// Design review 3.1 and choice 13: what needs the person sits on top, Reading between, the rest is Done.
describe("inboxGroupOf", () => {
  it.each([
    ["needs-input", "needs-you"],
    ["confirm-split", "needs-you"],
    ["no-match", "needs-you"],
    ["possible-duplicate", "needs-you"],
    ["could-not-read", "needs-you"],
    ["reading", "reading"],
    ["linked-automatically", "done"],
    ["kept-as-reference", "done"],
    ["saved", "done"],
    ["duplicate", "done"],
  ] as const)("puts %s in %s", (status, group) => {
    expect(inboxGroupOf(status)).toBe(group);
  });
});
