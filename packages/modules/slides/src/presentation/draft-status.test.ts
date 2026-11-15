import { describe, expect, it } from "vitest";

import { draftStatus, isUnnamed } from "./draft-status.ts";

describe("the deck page's draft pill", () => {
  // Bug caught: the pill names the wrong slide (the count, not the one in work), or a stopped run
  // from the time box or loop guard reads differently from Stop (DEC-57).
  it.each([
    ["building", false, 0, "Drafting slide 1"],
    ["building", false, 2, "Drafting slide 3"],
    ["stopping", false, 2, "Stopping"],
    ["saved", true, 1, "1 slide drafted"],
    ["saved", true, 4, "4 slides drafted"],
    ["stopped", true, 1, "Stopped, 1 slide kept"],
    ["stopped", true, 3, "Stopped, 3 slides kept"],
    ["failed", true, 2, "Drafting did not finish. 2 slides drafted"],
    ["interrupted", true, 2, "Drafting did not finish. 2 slides drafted"],
  ] as const)(
    "%s, ended here %s, %i drafted: %s",
    (run, endedHere, drafted, pill) => {
      expect(draftStatus({ run, endedHere, drafted })).toBe(pill);
    }
  );

  // Bug caught: an old run's end shows a pill on every later visit to the deck.
  it.each(["saved", "stopped", "failed", "interrupted", null] as const)(
    "shows no pill for a %s run this visit did not see end",
    (run) => {
      expect(draftStatus({ run, endedHere: false, drafted: 2 })).toBeNull();
    }
  );
});

describe("the deck title while the agent names it", () => {
  // Bug caught (Review Focus 5): the loading title stays for ever when the run ends without a rename.
  it.each([
    ["building", "New deck", "New deck", true],
    ["stopping", "New deck", "New deck", true],
    ["building", "October collections", "New deck", false],
    ["saved", "New deck", "New deck", false],
    ["stopped", "New deck", "New deck", false],
    ["failed", "New deck", "New deck", false],
    ["interrupted", "New deck", "New deck", false],
    [null, "New deck", null, false],
  ] as const)(
    "%s run, title %s, chat %s: unnamed %s",
    (run, title, sessionTitle, unnamed) => {
      expect(isUnnamed({ run, title, sessionTitle })).toBe(unnamed);
    }
  );
});
