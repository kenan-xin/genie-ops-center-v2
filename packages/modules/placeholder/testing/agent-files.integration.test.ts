import { randomUUID } from "node:crypto";

import {
  AGENT_FILE_JOB,
  type AuditMetadataValue,
  callProcedure,
  createAgentFile,
  createAgentRouter,
  type DatasetQuery,
  createOwnSession,
  principalFor,
  registerModuleRuntime,
  type ModuleRequestContext,
} from "@genie/core";
import {
  assignRole,
  enableModules,
  insertPersonWith,
  insertRole,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { parse } from "papaparse";
import { readSheet } from "read-excel-file/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { placeholderModule } from "../src/module.ts";
import { placeholderRecord } from "../src/schema.ts";
import { AGENT_RECORDS, insertAgentRecords } from "./agent-fixtures.ts";

/**
 * The core file job on the placeholder (Spec 7 R-44a, R-12, R-47), against a real Postgres. The job
 * runs as the person who asked, with the grants of the run, reads every page, and writes one file
 * and one audit row without values.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const RECORDS = "placeholder.records";

const [ALPHA] = AGENT_RECORDS;

const LABELS: DatasetQuery = {
  select: ["id", "label", "amountCents", "currency"],
};

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  await markSetupDone(deployment.context);
  // Before any settings read, so the 10 s settings cache never holds another date (DEC-46).
  await deployment.context.db.$client.query(
    "update tenant_settings set reporting_date = '2026-10-27'"
  );
  await enableModules(deployment.context, ["placeholder"]);
  registerModuleRuntime(deployment.context, [placeholderModule]);
  await insertAgentRecords(deployment.context);
}, 120000);

afterAll(async () => {
  await deployment?.stop();
});

/** The person's context as the worker builds it for a run: their grants as they are now. */
function contextFor(userId: string): ModuleRequestContext {
  return {
    tenant: deployment.context,
    caller: principalFor({
      tenant: deployment.context,
      modules: [placeholderModule],
      userId,
      authenticated: true,
    }),
  };
}

/** A file queued in a new chat of the person, as the `make-file` tool records it. */
async function queuedFile(
  userId: string,
  input: {
    readonly format: "csv" | "xlsx";
    readonly query: DatasetQuery;
  }
): Promise<string> {
  const ctx = contextFor(userId);
  const sessionId = randomUUID();

  await createOwnSession(ctx, {
    id: sessionId,
    title: "Records",
    modelId: "test-model",
  });

  return createAgentFile(ctx, {
    sessionId,
    toolCallId: "call-make-file",
    title: "All records",
    format: input.format,
    dataset: RECORDS,
    query: input.query,
  });
}

/** Runs the job as the worker does: the starter's principal, built at the run. */
async function runJob(userId: string, agentFileId: string): Promise<void> {
  await AGENT_FILE_JOB.handler(contextFor(userId), { agentFileId });
}

async function fileRow(agentFileId: string) {
  const { rows } = await deployment.context.db.$client.query<{
    state: string;
    row_count: number | null;
    file_id: string | null;
  }>("select state, row_count, file_id from agent_file where id = $1", [
    agentFileId,
  ]);

  return rows[0];
}

async function auditRows(agentFileId: string) {
  const { rows } = await deployment.context.db.$client.query<{
    actor_user_id: string | null;
    metadata: AuditMetadataValue;
  }>(
    "select actor_user_id, metadata from audit_event where action = 'core:agent_file_made' and metadata->>'agentFileId' = $1",
    [agentFileId]
  );

  return rows;
}

async function bytesOf(agentFileId: string): Promise<Buffer> {
  const row = await fileRow(agentFileId);

  if (row?.file_id === null || row === undefined) throw new Error("No file.");

  return (await deployment.context.fileStorage.fetch(row.file_id)).bytes;
}

async function csvLabels(agentFileId: string): Promise<string[]> {
  const { data } = parse<string[]>((await bytesOf(agentFileId)).toString());

  const [header, ...rows] = data;
  const at = header?.indexOf("Label") ?? -1;

  return rows.map((cells) => cells[at] ?? "").toSorted();
}

/** Waits, at most 10 s, until `count` sessions of the database wait on a lock. */
async function waitersReach(count: number): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the lock waits show.
    const { rows } = await deployment.context.db.$client.query<{
      waiting: number;
    }>(
      "select count(distinct pid)::int as waiting from pg_locks where not granted"
    );

    if (rows[0]?.waiting === count) return;

    // oxlint-disable-next-line no-await-in-loop -- polls until the lock waits show.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`${count} sessions never waited on a lock.`);
}

const fullReader = async () =>
  (
    await insertPersonWith(deployment.context, [
      "core:ask:use",
      "placeholder:read",
    ])
  ).userId;

describe("the agent file job on the placeholder", () => {
  it("writes every record a full reader may read as CSV and Excel, once, with one audit row", async () => {
    const person = await fullReader();
    const labels = AGENT_RECORDS.map(({ label }) => label).toSorted();

    const csv = await queuedFile(person, { format: "csv", query: LABELS });

    await runJob(person, csv);
    await runJob(person, csv);

    expect(await csvLabels(csv)).toEqual(labels);
    expect(await fileRow(csv)).toMatchObject({ state: "ready", row_count: 3 });

    const { rows: files } = await deployment.context.db.$client.query(
      "select f.id from file f join agent_file a on a.file_id = f.id where a.id = $1",
      [csv]
    );

    expect(files).toHaveLength(1);

    const audits = await auditRows(csv);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_user_id: person,
      metadata: { rowCount: 3, outcome: "made", format: "csv" },
    });

    const stored = JSON.stringify(audits);

    for (const value of [...labels, ...AGENT_RECORDS.map(({ id }) => id)]) {
      expect(stored).not.toContain(value);
    }

    const xlsx = await queuedFile(person, { format: "xlsx", query: LABELS });

    await runJob(person, xlsx);

    const [header, ...sheet] = await readSheet(await bytesOf(xlsx));

    expect(header).toEqual(["Label", "Amount", "Currency"]);
    expect(sheet.map(([label]) => label).toSorted()).toEqual(labels);
  });

  it("writes only the records a scoped reader may read", async () => {
    const { userId } = await insertPersonWith(
      deployment.context,
      ["placeholder:read"],
      { type: "placeholder-record", id: ALPHA.id }
    );

    const roleId = await insertRole(deployment.context, {
      permissions: ["core:ask:use"],
    });

    await assignRole(deployment.context, {
      roleId,
      principal: { type: "user", id: userId },
    });

    const csv = await queuedFile(userId, { format: "csv", query: LABELS });

    await runJob(userId, csv);

    expect(await csvLabels(csv)).toEqual([ALPHA.label]);
  });

  it("fails without a retry and stores no file when the starter lost the read key", async () => {
    const { userId, assignmentId } = await insertPersonWith(
      deployment.context,
      ["placeholder:read"]
    );

    const roleId = await insertRole(deployment.context, {
      permissions: ["core:ask:use"],
    });

    await assignRole(deployment.context, {
      roleId,
      principal: { type: "user", id: userId },
    });

    const csv = await queuedFile(userId, { format: "csv", query: LABELS });

    await deployment.context.db.$client.query(
      "delete from role_assignment where id = $1",
      [assignmentId]
    );

    // The handler resolves, so the worker completes the job and pg-boss retries nothing.
    await expect(runJob(userId, csv)).resolves.toBeUndefined();

    expect(await fileRow(csv)).toMatchObject({
      state: "failed",
      file_id: null,
    });
    expect((await auditRows(csv))[0]?.metadata).toMatchObject({
      outcome: "forbidden",
    });
  });

  it("stores no file when the chat is deleted while the file is made", async () => {
    const person = await fullReader();
    const csv = await queuedFile(person, { format: "csv", query: LABELS });

    const { rows } = await deployment.context.db.$client.query<{
      session_id: string;
    }>("select session_id from agent_file where id = $1", [csv]);

    const sessionId = rows[0]?.session_id ?? "";

    // The job's audit row is its first audit_event write, inside its transaction: it parks there.
    const blocker = await deployment.context.db.$client.connect();

    try {
      await blocker.query("begin");
      await blocker.query("lock table audit_event in share mode");

      const job = runJob(person, csv);

      await waitersReach(1);

      const removed = callProcedure(
        createAgentRouter(),
        contextFor(person)
      ).remove({ id: sessionId });

      await waitersReach(2);

      await blocker.query("commit");
      await Promise.all([job, removed]);
    } finally {
      await blocker.query("rollback");
      blocker.release();
    }

    const { rows: files } = await deployment.context.db.$client.query<{
      count: number;
    }>(
      "select count(*)::int as count from file where uploaded_by_user_id = $1",
      [person]
    );

    expect(files[0]?.count).toBe(0);
  });

  it("pages past 1,000 rows", async () => {
    const day = "2026-06-01";

    await deployment.context.db.insert(placeholderRecord).values(
      Array.from({ length: 1005 }, (_, index) => ({
        label: `Paged ${index}`,
        recordedOn: day,
      }))
    );

    const person = await fullReader();

    const csv = await queuedFile(person, {
      format: "csv",
      query: {
        select: ["id", "label"],
        filters: [{ field: "recordedOn", op: "eq", value: day }],
      },
    });

    await runJob(person, csv);

    expect(await fileRow(csv)).toMatchObject({
      state: "ready",
      row_count: 1005,
    });
    expect(new Set(await csvLabels(csv)).size).toBe(1005);
  });
});
