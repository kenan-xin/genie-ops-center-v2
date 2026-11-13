import {
  callProcedure,
  enqueueJob,
  JOB_STARTER_KEY,
  principalFor,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { touchRecordJob } from "../src/jobs.ts";
import { placeholderModule } from "../src/module.ts";
import { placeholderRouter } from "../src/router.ts";
import { insertPlaceholderRecord } from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * Module-enqueued jobs through the real worker against a real Postgres: the job runs as the person
 * who started it, and pg-boss retries a failed run by the declared policy (Spec 7 R-12, AC-3).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;
let workerAbort: AbortController;
let workerRun: Promise<number> | undefined;

type JobRow = {
  readonly state: string;
  readonly retry_count: number;
  readonly retry_limit: number;
  readonly retry_delay: number;
  readonly retry_backoff: boolean;
  readonly data: { readonly "id": string; readonly "genie:startedBy"?: string };
};

/* oxlint-disable no-await-in-loop -- poll only until the first observed database state. */
async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("the job did not reach the expected state");
}
/* oxlint-enable no-await-in-loop */

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);

  // Enabled before the worker starts, so its 10 s entitlement cache never holds a disabled answer.
  await enableModules(deployment.context, ["placeholder"]);

  const { runWorker } =
    await import("../../../core/src/services/worker/index.ts");

  workerAbort = new AbortController();
  const { promise: ready, resolve: started } = Promise.withResolvers<void>();

  workerRun = runWorker({
    source: {
      DATABASE_URL: deployment.context.env.databaseUrl,
      PUBLIC_URL: deployment.context.env.publicUrl,
    },
    modules: [placeholderModule],
    histories: [],
    output: (line) => {
      if (line.includes("worker started")) started();
    },
    errorOutput: () => {},
    signal: workerAbort.signal,
    shutdownTimeoutMs: 1000,
  });
  void workerRun.then(() => started());

  // The worker has created and updated every queue once it says it started.
  await ready;
}, 120000);

afterAll(async () => {
  workerAbort?.abort();
  await workerRun?.catch(() => undefined);
  await deployment?.stop();
});

function principal(userId: string) {
  return principalFor({
    tenant: deployment.context,
    modules: [placeholderModule],
    userId,
    authenticated: true,
  });
}

async function personWith(
  keys: Parameters<typeof insertPersonWith>[1]
): Promise<string> {
  return (await insertPersonWith(deployment.context, keys)).userId;
}

async function touch(userId: string, id: string): Promise<string> {
  const { jobId } = await callProcedure(placeholderRouter, {
    tenant: deployment.context,
    caller: principal(userId),
  }).touch({ id });

  if (jobId === null) throw new Error("the touch enqueued no job");

  return jobId;
}

async function touchedBy(id: string): Promise<readonly unknown[]> {
  const result = await deployment.context.db.$client.query(
    `select actor_user_id from audit_event
      where action = 'placeholder:record_touched' and target_id = $1`,
    [id]
  );

  return result.rows;
}

async function jobRow(id: string): Promise<JobRow | undefined> {
  const result = await deployment.context.db.$client.query<JobRow>(
    `select state, retry_count, retry_limit, retry_delay, retry_backoff, data
       from pgboss.job where id = $1`,
    [id]
  );

  return result.rows[0];
}

describe("the placeholder touch job through the worker", () => {
  it("a touch by a reader runs as them and audits under their name", async () => {
    const record = await insertPlaceholderRecord(deployment.context, {
      label: "A touched row",
    });
    const userId = await personWith(["placeholder:use", "placeholder:read"]);

    const jobId = await touch(userId, record.id);

    await waitUntil(async () => (await jobRow(jobId))?.state === "completed");
    expect(await touchedBy(record.id)).toEqual([{ actor_user_id: userId }]);
  });

  it("a touch by a person without placeholder:read completes and writes nothing", async () => {
    const record = await insertPlaceholderRecord(deployment.context);
    const jobId = await touch(await personWith(["placeholder:use"]), record.id);

    await waitUntil(async () => (await jobRow(jobId))?.state === "completed");
    expect(await touchedBy(record.id)).toEqual([]);
  });

  it("a forged starter in the job data is replaced by the caller", async () => {
    const record = await insertPlaceholderRecord(deployment.context);
    const userId = await personWith(["placeholder:read"]);
    const otherId = await personWith(["placeholder:read"]);

    const jobId = await enqueueJob(
      { tenant: deployment.context, caller: principal(userId) },
      touchRecordJob,
      // SAFETY: the forged key is the browser input under test; the type forbids nothing here.
      { id: record.id, [JOB_STARTER_KEY]: otherId } as never
    );

    if (jobId === null) throw new Error("the enqueue returned no job");
    expect((await jobRow(jobId))?.data).toEqual({
      id: record.id,
      [JOB_STARTER_KEY]: userId,
    });
  });

  it("a forged starter through the raw queue runs with no caller and writes nothing", async () => {
    const record = await insertPlaceholderRecord(deployment.context);
    const readerId = await personWith(["placeholder:read"]);

    const jobId = await deployment.context.jobQueue.enqueue(
      touchRecordJob.name,
      { id: record.id, [JOB_STARTER_KEY]: readerId }
    );

    if (jobId === null) throw new Error("the enqueue returned no job");
    await waitUntil(async () => (await jobRow(jobId))?.state === "completed");
    expect(await touchedBy(record.id)).toEqual([]);

    // A schedule stores its data for every later run, so the forged key is dropped there too.
    const key = `forged-starter-${record.id}`;
    await deployment.context.jobQueue.schedule(
      touchRecordJob.name,
      "0 0 1 1 *",
      { id: record.id, [JOB_STARTER_KEY]: readerId },
      { key }
    );
    const stored = await deployment.context.db.$client.query(
      "delete from pgboss.schedule where name = $1 and key = $2 returning data",
      [touchRecordJob.name, key]
    );
    expect(stored.rows).toEqual([{ data: { id: record.id } }]);
  });

  it("a failed run is retried by the declared policy, then completes", async () => {
    const id = crypto.randomUUID();
    const jobId = await enqueueJob(
      {
        tenant: deployment.context,
        caller: principal(await personWith(["placeholder:read"])),
      },
      touchRecordJob,
      { id }
    );

    if (jobId === null) throw new Error("the enqueue returned no job");

    await waitUntil(async () => (await jobRow(jobId))?.state === "retry");
    const policy = { retry_limit: 3, retry_delay: 1, retry_backoff: true };
    expect(await jobRow(jobId)).toMatchObject(policy);
    const queue = await deployment.context.db.$client.query(
      "select retry_limit, retry_delay, retry_backoff from pgboss.queue where name = $1",
      [touchRecordJob.name]
    );
    expect(queue.rows).toEqual([policy]);

    await insertPlaceholderRecord(deployment.context, { id });

    await waitUntil(async () => (await jobRow(jobId))?.state === "completed");
    expect((await jobRow(jobId))?.retry_count).toBeGreaterThanOrEqual(1);
  });
});
