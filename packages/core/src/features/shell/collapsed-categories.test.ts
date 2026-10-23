import { describe, expect, it } from "vitest";

import {
  COLLAPSED_CATEGORIES_KEY,
  readCollapsed,
  writeCollapsed,
} from "./collapsed-categories.ts";

function holding(value: string | null) {
  return {
    getItem: (key: string) => (key === COLLAPSED_CATEGORIES_KEY ? value : null),
  };
}

const throwing = () => {
  throw new Error("storage is unavailable");
};

describe("readCollapsed", () => {
  it.each([
    ["a missing value", holding(null)],
    ["a value that is not JSON", holding("{not json")],
    ["a JSON object", holding('{"ops":true}')],
    ["an array holding a number", holding('["ops",3]')],
    ["a throwing getItem", { getItem: throwing }],
    ["no storage at all", undefined],
  ])("answers an empty set for %s", (_, storage) => {
    expect(readCollapsed(storage).size).toBe(0);
  });
});

describe("writeCollapsed", () => {
  it("round-trips the ids it wrote", () => {
    const items = new Map<string, string>();

    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    };

    writeCollapsed(storage, new Set(["ops", "finance"]));

    expect(readCollapsed(storage)).toEqual(new Set(["ops", "finance"]));
  });

  it("swallows a throwing setItem", () => {
    expect(() =>
      writeCollapsed({ setItem: throwing }, new Set(["ops"]))
    ).not.toThrow();
  });
});
