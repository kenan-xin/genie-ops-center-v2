import { describe, expect, it } from "vitest";

import { centsOfText } from "./format.ts";

// Design review 4.5: an amount shows its thousands separators and still saves in cents.
describe("centsOfText", () => {
  it.each([
    ["5,000.00", 500000],
    [" 5000 ", 500000],
    ["1,234,567.8", 123456780],
    ["5,00", undefined],
    ["50,00.00", undefined],
    ["", undefined],
  ] as const)("reads %j as %j cents", (text, cents) => {
    expect(centsOfText(text)).toBe(cents);
  });
});
