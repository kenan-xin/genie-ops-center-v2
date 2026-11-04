import { describe, expect, it } from "vitest";

import { PIN_GAP, placePins } from "./desk-pins.ts";

const tops = (pins: Parameters<typeof placePins>[0]) =>
  Object.fromEntries(placePins(pins, PIN_GAP));

// D6: the pin column of the document desk (DK6).
describe("placePins", () => {
  it("centres each card on its line when the cards do not touch", () => {
    expect(
      tops([
        { key: "a", lineY: 100, height: 40 },
        { key: "b", lineY: 300, height: 40 },
      ])
    ).toEqual({ a: 80, b: 280 });
  });

  it("pushes a card below the card above, whatever the input order", () => {
    expect(
      tops([
        { key: "b", lineY: 110, height: 40 },
        { key: "a", lineY: 100, height: 40 },
      ])
    ).toEqual({ a: 80, b: 128 });
  });

  it("lists the cards with no line after the last pinned card, in input order", () => {
    expect(
      tops([
        { key: "x", lineY: null, height: 30 },
        { key: "a", lineY: 100, height: 40 },
        { key: "y", lineY: null, height: 30 },
      ])
    ).toEqual({ a: 80, x: 128, y: 166 });
  });

  it("never places a card above the column", () => {
    expect(tops([{ key: "a", lineY: 5, height: 40 }])).toEqual({ a: 0 });
  });
});
