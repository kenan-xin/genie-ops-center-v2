import { describe, expect, it } from "vitest";

import { runStatus } from "./runs.ts";

describe("runStatus", () => {
  it("maps the run columns to what a page shows", () => {
    const job = "job-1";

    const rows: Parameters<typeof runStatus>[0][] = [
      { runState: "queued", runError: null, runJobId: job },
      { runState: "running", runError: null, runJobId: job },
      { runState: "stopping", runError: null, runJobId: job },
      { runState: null, runError: null, runJobId: job },
      { runState: null, runError: "stopped", runJobId: job },
      { runState: null, runError: "interrupted", runJobId: job },
      { runState: null, runError: "failed", runJobId: job },
      { runState: null, runError: null, runJobId: null },
    ];

    expect(rows.map((row) => runStatus(row))).toEqual([
      "building",
      "building",
      "stopping",
      "saved",
      "stopped",
      "interrupted",
      "failed",
      null,
    ]);
  });
});
