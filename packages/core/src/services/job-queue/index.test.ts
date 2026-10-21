import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { bossOptions } from "./index.ts";

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
