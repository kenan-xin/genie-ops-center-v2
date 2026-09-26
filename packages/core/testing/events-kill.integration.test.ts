import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWorker } from "../src/services/worker/index.ts";
import { killCaseModule } from "./events-kill-module.ts";
import { startDisposableDeployment } from "./index.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- process setup and database assertions stay together. */

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;
let workerAbort: AbortController | undefined;
let workerRun: Promise<number> | undefined;

/* oxlint-disable no-await-in-loop -- poll only until the first observed database state. */
async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("durable event was not consumed after the worker started");
}
/* oxlint-enable no-await-in-loop */

beforeAll(async () => {
  deployment = await startDisposableDeployment([killCaseModule]);
  await deployment.context.db.$client.query(`
    create table event_kill_effect (
      event_id uuid primary key,
      label text not null
    )
  `);
});

afterAll(async () => {
  workerAbort?.abort();
  await workerRun?.catch(() => undefined);
  await deployment?.stop();
});

describe("durable event recovery after a process kill", () => {
  it("delivers a committed event after its emitting process exits hard", async () => {
    const id = crypto.randomUUID();
    const label = "committed-before-hard-exit";
    const childPath = fileURLToPath(
      new URL("./events-kill-child.ts", import.meta.url)
    );
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", childPath],
      {
        env: {
          ...process.env,
          DATABASE_URL: deployment.context.env.databaseUrl,
          EVENT_ID: id,
          EVENT_LABEL: label,
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    const exit = new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const { code, signal } = await exit;
    if (code !== 0) {
      throw new Error(`emitter child exited ${signal ?? code}: ${output}`);
    }
    expect(signal).toBeNull();

    const beforeWorker = await deployment.context.db.$client.query<{
      count: number;
    }>(
      "select count(*)::int as count from event_kill_effect where label = $1",
      [label]
    );
    expect(beforeWorker.rows[0]?.count).toBe(0);

    workerAbort = new AbortController();
    workerRun = runWorker({
      source: {
        DATABASE_URL: deployment.context.env.databaseUrl,
        PUBLIC_URL: deployment.context.env.publicUrl,
      },
      modules: [killCaseModule],
      histories: [],
      output: () => {},
      errorOutput: () => {},
      signal: workerAbort.signal,
      shutdownTimeoutMs: 1000,
    });
    void workerRun.catch(() => {});

    await waitUntil(async () => {
      const result = await deployment.context.db.$client.query<{
        present: boolean;
      }>("select to_regclass('public.tenant_module') is not null as present");

      return result.rows[0]?.present === true;
    });
    await deployment.context.db.$client.query(
      `insert into tenant_module (module_id, enabled)
       values ('event-kill', true)
       on conflict (module_id) do update set enabled = true`
    );

    await waitUntil(async () => {
      const result = await deployment.context.db.$client.query<{
        count: number;
      }>(
        "select count(*)::int as count from event_kill_effect where label = $1",
        [label]
      );

      return result.rows[0]?.count === 1;
    });
  });
});
