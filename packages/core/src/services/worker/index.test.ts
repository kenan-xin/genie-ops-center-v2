import { describe, expect, it } from "vitest";

import { DEFAULT_WORKER_HEARTBEAT_PATH, heartbeatPath } from "./index.ts";

const SOURCE = {
  DATABASE_URL: "postgres://genie@db.invalid/genie",
  PUBLIC_URL: "https://test.example.invalid",
};

describe("the worker heartbeat path", () => {
  it("uses WORKER_HEARTBEAT_PATH when set", () => {
    expect(
      heartbeatPath({
        source: { ...SOURCE, WORKER_HEARTBEAT_PATH: "/tmp/custom-heartbeat" },
      })
    ).toBe("/tmp/custom-heartbeat");
  });

  it.each([
    { case: "unset", source: SOURCE },
    { case: "empty", source: { ...SOURCE, WORKER_HEARTBEAT_PATH: "" } },
  ])(
    "falls back to the documented default when the variable is $case",
    ({ source }) => {
      expect(heartbeatPath({ source })).toBe("/tmp/genie-worker-heartbeat");
      expect(DEFAULT_WORKER_HEARTBEAT_PATH).toBe("/tmp/genie-worker-heartbeat");
    }
  );
});
