import { afterEach, describe, expect, it } from "vitest";

import {
  type DeckSyncMessage,
  formatElapsed,
  openDeckSync,
} from "./deck-sync.ts";

const ends: { close: () => void }[] = [];

/** One end that records what it hears; every end closes after the test, or Node keeps running. */
function listen(deckId: string) {
  const heard: DeckSyncMessage[] = [];
  const end = openDeckSync(deckId, (message) => heard.push(message));

  ends.push(end);

  return { ...end, heard };
}

/** Node delivers a message on a later turn; one short wait lets every pending one arrive. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

afterEach(() => {
  for (const end of ends.splice(0)) end.close();
});

describe("the deck sync between the audience and presenter windows", () => {
  it("carries a show to the other end of the same deck only", async () => {
    const audience = listen("deck-1");
    const presenter = listen("deck-1");
    const otherDeck = listen("deck-2");

    audience.post({ kind: "show", index: 2, from: "audience" });
    await settle();

    expect(presenter.heard).toEqual([
      { kind: "show", index: 2, from: "audience" },
    ]);
    expect(audience.heard).toEqual([]);
    expect(otherDeck.heard).toEqual([]);
  });

  it("hears nothing after close", async () => {
    const audience = listen("deck-1");
    const presenter = listen("deck-1");

    presenter.close();
    audience.post({ kind: "ask" });
    await settle();

    expect(presenter.heard).toEqual([]);
  });
});

describe("the presenter timer", () => {
  it.each([
    [0, "0:00"],
    [59, "0:59"],
    [754, "12:34"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
  ])("shows %i seconds as %s", (seconds, shown) => {
    expect(formatElapsed(seconds)).toBe(shown);
  });
});
