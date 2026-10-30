import {
  createTenantContext,
  JOB_STARTER_KEY,
  principalFor,
  type ModuleRequestContext,
  withTransaction,
} from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
  writeModelConnection,
} from "@genie/core/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import { type ReadingStatus, sourceDocument } from "../src/schema.ts";
import { uploadDocument } from "../src/services/documents/upload.ts";
import { readingJob, retryReading } from "../src/services/reading/job.ts";
import { readDemoFile } from "./demo-pack.ts";
import { insertDocument } from "./factories.ts";
import { BROKEN_PDF, NO_TEXT_PDF, withNewId } from "./pdf-fixtures.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The reading job on a real Postgres, the real file store and the real queue (R-12, R-26). The
 * tests call the handler as the worker does; the worker's retry mapping is core's (S7-03, AC-3).
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let uploaderId: string;

let retrierId: string;

const t = () => deployment.context;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  // Before the first settings read, which caches for 10 s (DEC-46).
  await writeModelConnection(deployment.context, {
    allowed: ["deepseek/deepseek-v4.1-flash-1017", "anthropic/claude-opus-5.5"],
    chat: "deepseek/deepseek-v4.1-flash-1017",
    document: "deepseek/deepseek-v4.1-flash-1017",
  });
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["invoices"]);
  const writer = ["invoices:use", "invoices:read", "invoices:write"];
  ({ userId: uploaderId } = await insertPersonWith(deployment.context, writer));
  ({ userId: retrierId } = await insertPersonWith(deployment.context, writer));
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const as = (userId: string): ModuleRequestContext => ({
  tenant: t(),
  caller: principalFor({
    tenant: t(),
    modules: [invoicesModule],
    userId,
    authenticated: true,
  }),
});

const run = (documentId: string) =>
  readingJob.handler(as(uploaderId), { documentId });

const live01 = () =>
  withNewId(
    readDemoFile("03_Live_Upload_Documents/01_Invoice_Missing_Due_Date.pdf")
  );

const file01 = (bytes: Buffer) =>
  new File([new Uint8Array(bytes)], "01.pdf", { type: "application/pdf" });

/** A document whose stored file holds these bytes, in the given reading state. */
async function aDocument(
  bytes: Buffer,
  readingStatus: ReadingStatus,
  readingAttempts = 0
): Promise<string> {
  const { id: fileId } = await withTransaction(t(), (tx) =>
    t().fileStorage.store(
      {
        fileName: "document.pdf",
        mimeType: "application/pdf",
        bytes,
        uploadedByUserId: uploaderId,
      },
      tx
    )
  );

  return (
    await insertDocument(t(), {
      kind: null,
      fileId,
      readingStatus,
      readingAttempts,
    })
  ).id;
}

async function documentRow(id: string) {
  const [row] = await t()
    .db.select()
    .from(sourceDocument)
    .where(eq(sourceDocument.id, id));

  return row;
}

type JobRow = {
  readonly data: {
    readonly documentId: string;
    readonly [JOB_STARTER_KEY]?: string;
  };
  readonly retry_limit: number;
  readonly retry_backoff: boolean;
};

async function jobsOf(documentId: string): Promise<readonly JobRow[]> {
  const { rows } = await t().db.$client.query<JobRow>(
    "select data, retry_limit, retry_backoff from pgboss.job where name = 'invoices.read-document' and data->>'documentId' = $1",
    [documentId]
  );

  return rows;
}

describe("the reading job", () => {
  it("an upload enqueues one reading job as the uploader with two retries and backoff", async () => {
    const answer = await uploadDocument(as(uploaderId), file01(live01()));

    expect(answer.outcome).toBe("uploaded");
    const jobs = await jobsOf(answer.documentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ retry_limit: 2, retry_backoff: true });
    expect(jobs[0]?.data[JOB_STARTER_KEY]).toBe(uploaderId);
  });

  it("a document that cannot be read fails twice, then shows Could not read", async () => {
    const id = await aDocument(BROKEN_PDF, "reading");

    await expect(run(id)).rejects.toThrow();
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 1,
    });
    await expect(run(id)).rejects.toThrow();
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 2,
    });
    await expect(run(id)).resolves.toBeUndefined();
    expect(await documentRow(id)).toMatchObject({
      readingStatus: "could-not-read",
      readingAttempts: 3,
    });
  });

  it("a run for a read document changes nothing", async () => {
    const id = await aDocument(NO_TEXT_PDF, "read");
    const before = await documentRow(id);

    await run(id);

    expect(await documentRow(id)).toEqual(before);
  });

  it("a run without a starter claims nothing", async () => {
    const id = await aDocument(NO_TEXT_PDF, "reading");

    await readingJob.handler({ tenant: t() }, { documentId: id });

    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 0,
    });
  });

  it("Retry reads a document that could not be read again, once", async () => {
    const id = await aDocument(BROKEN_PDF, "could-not-read", 3);

    await expect(retryReading(as(retrierId), id)).resolves.toEqual({
      documentId: id,
    });

    expect(await documentRow(id)).toMatchObject({
      readingStatus: "reading",
      readingAttempts: 0,
    });
    const jobs = await jobsOf(id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data[JOB_STARTER_KEY]).toBe(retrierId);
    await expect(retryReading(as(retrierId), id)).rejects.toMatchObject({
      code: "invoices:document-not-retryable",
    });
    expect(await jobsOf(id)).toHaveLength(1);
  });

  it("a failed enqueue leaves the uploaded document Could not read", async () => {
    // `withTransaction` accepts only a context that `createTenantContext` built, so a spread copy
    // cannot carry the queue: a context of its own gets a copy that `createJobQueue` did not
    // build, and `enqueueJob` throws on it.
    const tenant = createTenantContext(
      { DATABASE_URL: t().env.databaseUrl, PUBLIC_URL: t().env.publicUrl },
      silentLogger(),
      ["invoices"]
    );
    Object.assign(tenant, { jobQueue: { ...tenant.jobQueue } });
    const { caller } = as(uploaderId);

    const answer = await uploadDocument(
      { tenant, caller },
      file01(live01())
    ).finally(() => tenant.db.$client.end());

    expect(answer.outcome).toBe("uploaded");
    expect(await documentRow(answer.documentId)).toMatchObject({
      readingStatus: "could-not-read",
    });
  });

  it("a PDF with no text layer needs input with its reason", async () => {
    const id = await aDocument(NO_TEXT_PDF, "reading");

    await run(id);

    expect(await documentRow(id)).toMatchObject({
      readingStatus: "read",
      readingOutcome: "no-text-layer",
      kind: null,
      reading: null,
    });
  });
});
