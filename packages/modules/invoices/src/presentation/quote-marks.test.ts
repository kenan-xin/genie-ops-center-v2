import { describe, expect, it } from "vitest";

import { markedHtml, quoteRanges, type TextItem } from "./quote-marks.ts";

const item = (str: string, hasEOL = false): TextItem => ({ str, hasEOL });

function ranges(items: readonly TextItem[], quotes: readonly string[]) {
  return Object.fromEntries(quoteRanges(items, quotes));
}

const SPLIT_TOTAL = [item("TOTAL (SGD)"), item(" "), item("5,000.00", true)];

const SPLIT_REFERENCE = [
  item("Invoice reference INV-2026-08-04", true),
  item("| SGD 4,050.00"),
];

describe("the source marks of a page", () => {
  // B1.1: a quote crosses text items and a line end, and each item gets its own range.
  it("marks a quote that spans text items and a line end", () => {
    expect(ranges(SPLIT_TOTAL, ["TOTAL (SGD) 5,000.00"])).toEqual({
      0: [[0, 11]],
      2: [[0, 8]],
    });
  });

  // B1.1: the item boundary and the line end carry no mark of their own.
  it("marks a quote that spans an item boundary", () => {
    expect(
      ranges(SPLIT_REFERENCE, [
        "Invoice reference INV-2026-08-04 | SGD 4,050.00",
      ])
    ).toEqual({
      0: [[0, 32]],
      1: [[0, 14]],
    });
  });

  // B1.2: the page writes a no-break space and a thousands separator, and the quote still marks.
  it("marks a quote that differs from the page in spacing and separators", () => {
    expect(
      ranges([item("TOTAL (SGD) 5,000.00")], ["TOTAL (SGD) 5000.00"])
    ).toEqual({ 0: [[0, 20]] });
  });

  // B1.2: an astral character before the figure must not shift the separator translation.
  it.each([
    ["an emoji", "\u{1F600} 5,000.00"],
    ["a CJK Extension B character", "\u{20000} 5,000.00"],
  ])("marks a quote after %s without the thousands separator", (_, text) => {
    expect(ranges([item(text)], [text.replace(",", "")])).toEqual({
      0: [[0, text.length]],
    });
  });

  // B1.2: a quote after an astral character must start at its own first source character.
  it.each([
    ["\u{1F600} 5,000.00", "5000.00", [3, 11]],
    ["\u{1F600} TOTAL 5,000.00", "5,000.00", [9, 17]],
    ["\u{20000}\u{20000} Acme Ltd", "Acme Ltd", [5, 13]],
  ])("maps a quote that follows astral text: %s", (text, quote, expected) => {
    expect(ranges([item(text)], [quote])).toEqual({ 0: [expected] });
  });

  // B1.3: document text is data, so markup comes back escaped inside and outside a mark.
  it("escapes document text inside and outside a mark", () => {
    expect(markedHtml("<img src=x onerror=alert(1)>", [])).toBe(
      "&lt;img src=x onerror=alert(1)&gt;"
    );
    expect(markedHtml("<img src=x onerror=alert(1)>", [[0, 4]])).toBe(
      "<mark>&lt;img</mark> src=x onerror=alert(1)&gt;"
    );
  });

  // B1.4: a quote that is not on the page marks nothing.
  it("marks nothing for a quote that is not on the page", () => {
    expect(ranges(SPLIT_TOTAL, ["TOTAL (SGD) 6,000.00"])).toEqual({});
  });

  // B1.5: every quote on the page marks, not only the first one.
  it("marks both quotes on a page", () => {
    expect(
      ranges(
        [item("INV-2026-08-04", true), item("INV-2026-09-04")],
        ["INV-2026-08-04", "INV-2026-09-04"]
      )
    ).toEqual({
      0: [[0, 14]],
      1: [[0, 14]],
    });
  });
});
