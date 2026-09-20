import { describe, expect, it } from "vitest";

import { placeholderRecords } from "./records.ts";

describe("placeholderRecords", () => {
  it("holds more than one row, so the list state differs from the empty state", () => {
    expect(placeholderRecords.length).toBeGreaterThan(1);
  });

  it("gives every row a distinct id, because the list keys on it", () => {
    const ids = new Set(placeholderRecords.map((record) => record.id));

    expect(ids.size).toBe(placeholderRecords.length);
  });

  it("gives every row a label and a detail the stories can assert on", () => {
    for (const record of placeholderRecords) {
      expect(record.label).not.toBe("");
      expect(record.detail).not.toBe("");
    }
  });
});
