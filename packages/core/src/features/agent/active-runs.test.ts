import { describe, expect, it } from "vitest";

import { activeRunsInterval } from "./active-runs.ts";

// R15: the menu reads the person's runs every 5 s while one works, else every 30 s.
describe("activeRunsInterval", () => {
  it.each([
    ["no read yet", { status: "pending" as const }, 30_000],
    [
      "no run works",
      { status: "success" as const, data: { count: 0 } },
      30_000,
    ],
    ["one run works", { status: "success" as const, data: { count: 1 } }, 5000],
    // A refused read keeps its last data; it must not keep polling fast.
    [
      "the read was refused",
      { status: "error" as const, data: { count: 2 } },
      30_000,
    ],
  ])("%s", (_name, state, interval) => {
    expect(activeRunsInterval(state)).toBe(interval);
  });
});
