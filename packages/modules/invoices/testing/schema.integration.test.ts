import { startDisposableDeployment } from "@genie/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { invoicesModule } from "../src/module.ts";
import type { ReadingStatus } from "../src/schema.ts";
import {
  insertAllocation,
  insertCustomer,
  insertDocument,
  insertFieldOrigin,
  insertInvoice,
  insertPayment,
} from "./factories.ts";

/**
 * The module's constraints on a real Postgres with the real migration history (R-22, R-34). Each
 * row is a write the schema itself must refuse, whatever code sends it. No part of the database
 * is mocked.
 */
let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([invoicesModule]);
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await deployment?.stop();
});

const t = () => deployment.context;

async function anInvoiceAndAPayment() {
  const { id: customerId } = await insertCustomer(t());
  const { id: invoiceId } = await insertInvoice(t(), { customerId });
  const { id: paymentId } = await insertPayment(t(), { customerId });

  return { invoiceId, paymentId };
}

async function aCustomerId() {
  return (await insertCustomer(t())).id;
}

describe("the invoices schema", () => {
  it.each([
    [
      "a second document with the same hash",
      async () => {
        const d = await insertDocument(t());
        await insertDocument(t(), { sha256: d.sha256 });
      },
    ],
    [
      "a second allocation of one invoice and one payment",
      async () => {
        const pair = await anInvoiceAndAPayment();
        await insertAllocation(t(), { ...pair, amountCents: 100 });
        await insertAllocation(t(), { ...pair, amountCents: 100 });
      },
    ],
    [
      "an allocation of 0 cents",
      async () => {
        const pair = await anInvoiceAndAPayment();
        await insertAllocation(t(), { ...pair, amountCents: 0 });
      },
    ],
    [
      "an invoice total of 0 cents",
      async () => {
        await insertInvoice(t(), {
          customerId: await aCustomerId(),
          totalCents: 0,
        });
      },
    ],
    [
      "a payment amount of 0 cents",
      async () => {
        await insertPayment(t(), {
          customerId: await aCustomerId(),
          amountCents: 0,
        });
      },
    ],
    [
      "a due date with source unspecified",
      async () => {
        await insertInvoice(t(), {
          customerId: await aCustomerId(),
          dueDate: "2026-10-15",
          dueDateSource: "unspecified",
        });
      },
    ],
    [
      "no due date with source document",
      async () => {
        await insertInvoice(t(), {
          customerId: await aCustomerId(),
          dueDate: null,
          dueDateSource: "document",
        });
      },
    ],
    [
      "a customer name that differs only in case and outer spaces",
      async () => {
        await insertCustomer(t(), { name: "ABC Trading" });
        await insertCustomer(t(), { name: " abc trading " });
      },
    ],
    [
      "a currency in lower case",
      async () => {
        await insertInvoice(t(), {
          customerId: await aCustomerId(),
          currency: "sgd",
        });
      },
    ],
    [
      "an extracted field origin without its quote",
      async () => {
        const { id: documentId } = await insertDocument(t());
        await insertFieldOrigin(t(), {
          documentId,
          field: "amount",
          quote: null,
        });
      },
    ],
    [
      "a document reading status outside its three values",
      async () => {
        await insertDocument(t(), {
          // SAFETY: deliberately not a ReadingStatus; the row proves the schema refuses a writer that bypasses the type.
          readingStatus: "paused" as ReadingStatus,
        });
      },
    ],
  ])("refuses %s", async (_, write) => {
    await expect(write()).rejects.toThrow();
  });
});
