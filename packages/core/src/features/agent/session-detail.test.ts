import { describe, expect, it } from "vitest";

import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { runPollInterval } from "./session-detail.ts";

function read(run: AgentRunStatus | null) {
  return { session: { run } };
}

describe("runPollInterval", () => {
  it("polls each second while the run builds or stops, and not otherwise", () => {
    expect([
      runPollInterval(read("building")),
      runPollInterval(read("stopping")),
      runPollInterval(read("saved")),
      runPollInterval(read("stopped")),
      runPollInterval(read(null)),
      runPollInterval(null),
    ]).toEqual([1000, 1000, false, false, false, false]);
  });
});
