import {
  agentToolSet,
  artifactTurn,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  seedRoles,
} from "@genie/core";
import {
  enableModules,
  insertPersonWith,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { readDocumentTool } from "../src/agent-tools.ts";
import type { StoredReading } from "../src/contract.ts";
import { invoicesModule } from "../src/module.ts";
import { insertCustomer, insertDocument } from "./factories.ts";

/* oxlint-disable anti-slop/require-readable-spacing -- integration setup and assertion pairs stay together. */

/**
 * The agent's one invoices tool on a real Postgres (S7-31, PC9): it reads one document of the
 * inbox for a tenant-wide reader, by value only, so a forged page context reads nothing more.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

const t = () => deployment.context;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
  await markSetupDone(t());
  await enableModules(t(), ["invoices"]);
  await seedRoles(t(), [invoicesModule]);
  registerModuleRuntime(t(), [invoicesModule]);
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

const onPage1 = (value: string) => ({
  value,
  quote: `Quoted ${value}`,
  page: 1,
});

/** The invoice of `apps/genie/testing/document-review-chat.ts`: it has no due date, so it needs input. */
const READING: StoredReading = {
  fields: {
    customer: onPage1("Harbor Foods"),
    number: onPage1("INV-2041"),
    date: onPage1("2026-10-01"),
    currency: onPage1("SGD"),
    amount: onPage1("1260.00"),
  },
  invoiceNumbers: [],
  dropped: [],
};

// SAFETY: `defineAgentTool` answers `AnyAgentTool`, whose input is `never`; this input matches the
// tool's `z.strictObject({ documentId })`, which core parses before every run.
const read = (userId: string, documentId: string) =>
  readDocumentTool.run(as(userId), { documentId } as never);

describe("invoices-read-document", () => {
  it("reads a needs-input invoice document by value, with no quote, page or file link", async () => {
    const { id } = await insertDocument(t(), {
      kind: "invoice",
      reading: READING,
    });
    // Another document, so a tool that reads the wrong one answers other facts.
    await insertDocument(t(), { kind: "payment" });
    const { userId } = await insertPersonWith(t(), [
      "invoices:use",
      "invoices:read",
    ]);

    await expect(read(userId, id)).resolves.toEqual({
      output: {
        id,
        label: "Document",
        kind: "invoice",
        status: "needs-input",
        reason: null,
        fields: {
          customer: "Harbor Foods",
          number: "INV-2041",
          date: "2026-10-01",
          currency: "SGD",
          amount: "1260.00",
        },
        invoiceNumbers: [],
      },
      rowCount: 1,
    });
  });

  it("refuses a reader scoped to one customer, so a forged page context reads no document", async () => {
    const { id: customerId } = await insertCustomer(t());
    const { id } = await insertDocument(t(), {
      kind: "invoice",
      reading: READING,
    });
    const { userId } = await insertPersonWith(
      t(),
      ["invoices:use", "invoices:read"],
      { type: "invoices-customer", id: customerId }
    );

    await expect(read(userId, id)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("invoices-list-datasets", () => {
  it("answers the invoice summary fields, and no person-facing title or label", async () => {
    const sessionId = "00000000-0000-4000-8000-00000000c0de";
    const { userId } = await insertPersonWith(t(), [
      "core:ask:use",
      "invoices:read",
    ]);
    const execute = (
      await agentToolSet(
        as(userId),
        { id: sessionId },
        artifactTurn(sessionId, 0)
      )
    )["list-datasets"]?.execute;

    if (execute === undefined) throw new Error('No tool "list-datasets".');

    const output = await execute(
      {},
      { toolCallId: "call-list-datasets", messages: [], context: {} }
    );
    const { datasets } = z
      .object({
        datasets: z.array(
          z.object({
            name: z.string(),
            summaryFields: z.array(z.string()).optional(),
          })
        ),
      })
      .parse(output);

    expect(
      datasets.find(({ name }) => name === "invoices.invoices")?.summaryFields
    ).toEqual(["invoiceNumber", "customerName", "outstandingCents"]);
    expect(JSON.stringify(output)).not.toMatch(/"(label|title)"/);
  });
});
