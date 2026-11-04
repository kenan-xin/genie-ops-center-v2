import { describe, expect, it } from "vitest";

import { readRail, SIDEBAR_RAIL_KEY, writeRail } from "./sidebar-rail.ts";

function holding(value: string | null) {
  return {
    getItem: (key: string) => (key === SIDEBAR_RAIL_KEY ? value : null),
  };
}

const throwing = () => {
  throw new Error("storage is unavailable");
};

describe("readRail", () => {
  it.each([
    ["a missing value", holding(null)],
    ["a value that is not JSON", holding("yes")],
    ["a JSON object", holding("{}")],
    ["a throwing getItem", { getItem: throwing }],
    ["no storage at all", undefined],
  ])("answers the open menu for %s", (_, storage) => {
    expect(readRail(storage)).toBe(false);
  });
});

describe("writeRail", () => {
  it.each([true, false])("round-trips %s", (rail) => {
    const items = new Map<string, string>();

    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };

    writeRail(storage, rail);

    expect(readRail(storage)).toBe(rail);
  });

  it("swallows a throwing setItem", () => {
    expect(() => writeRail({ setItem: throwing }, true)).not.toThrow();
  });
});
