import { setTimeout as sleep } from "node:timers/promises";

import {
  callProcedure,
  principalFor,
  type ModuleRequestContext,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { UploadDocumentOutput } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { invoicesRouter } from "../src/router.ts";
import { sourceDocument } from "../src/schema.ts";
import { readingJob } from "../src/services/reading/job.ts";
import { readDemoFile } from "./demo-pack.ts";
import { withNewId } from "./pdf-fixtures.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The document upload on a real Postgres and the real file store (R-23). The deployment's upload
 * limit is 4,096 bytes, above every live upload of the demo pack. No model key is stored, so AI is
 * off in this file.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let writerUserId: string;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule], {
    env: { FILE_MAX_BYTES: "4096" },
  });
  await markSetupDone(deployment.context);
  await enableModules(deployment.context, ["invoices"]);
  ({ userId: writerUserId } = await insertPersonWith(deployment.context, [
    "invoices:use",
    "invoices:read",
    "invoices:write",
  ]));
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const t = () => deployment.context;

const asWriter = (): ModuleRequestContext => ({
  tenant: t(),
  caller: principalFor({
    tenant: t(),
    modules: [invoicesModule],
    userId: writerUserId,
    authenticated: true,
  }),
});

const upload = (bytes: string | Uint8Array<ArrayBuffer>, name: string) =>
  callProcedure(invoicesRouter, asWriter()).uploadDocument({
    file: new File([bytes], name, { type: "application/pdf" }),
  });

const live = (name: string) =>
  new Uint8Array(readDemoFile(`03_Live_Upload_Documents/${name}`));

async function waitingOnLocks(): Promise<number> {
  const { rows } = await t().db.$client.query<{ n: number }>(
    "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'"
  );

  return rows[0]?.n ?? 0;
}

async function counts() {
  const { rows } = await t().db.$client.query(
    "select (select count(*)::int from document) as documents, (select count(*)::int from file) as files"
  );

  return rows[0];
}

describe("document upload", () => {
  it("stores 01 once with its SHA-256 and its name, unread", async () => {
    const name = "01_Invoice_Missing_Due_Date.pdf";
    const bytes = live(name);

    const answer = await upload(bytes, name);

    expect(answer).toEqual({
      outcome: "uploaded",
      documentId: expect.any(String),
    });
    const [row] = await t()
      .db.select()
      .from(sourceDocument)
      .where(eq(sourceDocument.id, answer.documentId));
    expect(row).toMatchObject({
      sha256:
        "d0f1e62a376d66efff5997e6c1f4dd441257e9d06a6cb306cfc3c1341ec5f10e",
      fileName: name,
      kind: null,
      readingStatus: "reading",
    });
    const stored = await t().fileStorage.fetch(row?.fileId ?? "");
    expect(stored.mimeType).toBe("application/pdf");
    expect(Buffer.compare(stored.bytes, bytes)).toBe(0);
  });

  it("answers duplicate for the same bytes and adds no document and no file", async () => {
    const name = "01_Invoice_Missing_Due_Date.pdf";
    const first = await upload(live(name), name);
    const before = await counts();

    await expect(upload(live(name), "again.pdf")).resolves.toEqual({
      outcome: "duplicate",
      documentId: first.documentId,
      label: name,
    });
    expect(await counts()).toEqual(before);
  });

  it("keeps one document and one file for two uploads of the same bytes at once", async () => {
    const name = "05_Payment_Unmatched.pdf";
    const hash =
      "920b5fa0ff939d18fcff2bc3ce528cc4963136314c2d94da3552af2bed823a81";

    // An uncommitted document with the hash lets both uploads pass the lookup and wait on the
    // unique hash; its rollback lets one win, so the other really meets the conflict.
    const held = await t().db.$client.connect();
    let answers: UploadDocumentOutput[];

    try {
      await held.query("begin");
      await held.query(
        "insert into document (file_id, sha256) values (gen_random_uuid(), $1)",
        [hash]
      );
      const race = Promise.all([
        upload(live(name), name),
        upload(live(name), name),
      ]);
      let waiting = 0;

      for (let tries = 0; tries < 200 && waiting < 2; tries += 1) {
        // oxlint-disable-next-line no-await-in-loop -- polling one value until it holds.
        await sleep(50);
        // oxlint-disable-next-line no-await-in-loop
        waiting = await waitingOnLocks();
      }
      // Both uploads really wait on the held hash, so the case is a race.
      expect(waiting).toBe(2);
      await held.query("rollback");
      answers = await race;
    } finally {
      held.release();
    }

    expect(answers.map((answer) => answer.outcome).toSorted()).toEqual([
      "duplicate",
      "uploaded",
    ]);
    const { rows } = await t().db.$client.query(
      "select (select count(*)::int from document where sha256 = $1) as documents, (select count(*)::int from file where checksum = $1) as files",
      [hash]
    );
    expect(rows[0]).toEqual({ documents: 1, files: 1 });
  });

  it("refuses a file that is not a PDF and stores nothing", async () => {
    const before = await counts();

    await expect(upload("plain notes", "notes.pdf")).rejects.toMatchObject({
      code: "invoices:document-not-pdf",
    });
    expect(await counts()).toEqual(before);
  });

  it("a reading with AI off needs input and sends no request", async () => {
    const name = "01_Invoice_Missing_Due_Date.pdf";
    const { documentId } = await upload(
      new Uint8Array(
        withNewId(readDemoFile(`03_Live_Upload_Documents/${name}`))
      ),
      name
    );

    await expect(
      readingJob.handler(asWriter(), { documentId })
    ).resolves.toBeUndefined();

    const [row] = await t()
      .db.select()
      .from(sourceDocument)
      .where(eq(sourceDocument.id, documentId));
    expect(row).toMatchObject({
      readingStatus: "read",
      readingOutcome: "ai-off",
      kind: null,
      reading: null,
    });
  });

  it("refuses a file over the upload limit and stores nothing", async () => {
    const before = await counts();
    const bytes = new TextEncoder().encode("%PDF-".padEnd(4097, " "));

    await expect(upload(bytes, "large.pdf")).rejects.toMatchObject({
      code: "invoices:document-too-large",
    });
    expect(await counts()).toEqual(before);
  });
});
