import { describe, expect, it } from "vitest";

import { centsOfText, dayFromText } from "./format.ts";

// Design review 4.4: the review writes days as "26 Oct 2026" and still takes the ISO day it read.
describe("dayFromText", () => {
  it.each([
    ["26 Oct 2026", "2026-10-26"],
    [" 26 october 2026 ", "2026-10-26"],
    ["6 Sept 2026", "2026-09-06"],
    ["2026-10-26", "2026-10-26"],
    ["31 Feb 2026", null],
    ["2026-02-31", null],
    ["26 Okt 2026", null],
    ["26/10/2026", null],
    ["", null],
  ] as const)("reads %j as %j", (text, day) => {
    expect(dayFromText(text)).toBe(day);
  });
});

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
