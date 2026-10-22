import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { silentLogger } from "../logging/index.ts";
import { bossOptions, createJobQueue } from "./index.ts";

// A pg pool is lazy: building one opens no connection, and nothing here queries it.
const pool = new Pool({
  connectionString: "postgres://genie@db.invalid/genie",
});

describe("bossOptions", () => {
  it("leaves the cron intervals to pg-boss's defaults when none are injected", () => {
    const options = bossOptions(pool, true);

    expect(options).not.toHaveProperty("cronMonitorIntervalSeconds");
    expect(options).not.toHaveProperty("cronWorkerIntervalSeconds");
  });

  it("supervises and schedules only on the worker instance, without LISTEN/NOTIFY", () => {
    expect(bossOptions(pool, false)).toMatchObject({
      supervise: false,
      schedule: false,
      useListenNotify: false,
    });
    expect(bossOptions(pool, true)).toMatchObject({
      supervise: true,
      schedule: true,
      useListenNotify: false,
    });
  });
});

describe("the job queue's schedule", () => {
  it("rejects a caller schedule key in the declaration-owned namespace", async () => {
    // The worker rewrites or removes `genie.module.*` keys every heartbeat, so a caller schedule
    // there would silently vanish. The refusal comes before pg-boss starts.
    const queue = createJobQueue(pool, silentLogger());

    await expect(
      queue.schedule(
        "reporting.read-record",
        "*/5 * * * *",
        { reportId: "caller" },
        { key: "genie.module.reporting.read-record" }
      )
    ).rejects.toThrow(/reserved/i);
  });
});
