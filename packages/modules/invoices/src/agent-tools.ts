import { defineAgentTool } from "@genie/core/contracts";
import { z } from "zod";

import { recordId } from "./contract.ts";
import { readDocumentFacts } from "./services/documents/review.ts";

/*
 * The agent never writes an invoice or a payment (R-46), so the module's one tool reads. It reads
 * one document of the inbox by value, under the review's tenant-wide check, so a forged page
 * context names at most a document the person may already read (S7-31, PC9).
 */
export const readDocumentTool = defineAgentTool({
  name: "invoices-read-document",
  step: {
    active: "Reading the document",
    done: "Read the document",
    failed: "Could not open the document",
  },
  description:
    "Reads one document of the Documents inbox by id: its name, type and inbox status, the reason when it needs input, the fields read from it and the invoice numbers it names. needs-input means a person must complete the fields and save it. confirm-split, no-match and possible-duplicate mean a person must decide how to link the payment. could-not-read means the reading failed, and the reason says why.",
  input: z.strictObject({ documentId: recordId }),
  permission: "invoices:read",
  run: async (ctx, input) => ({
    output: await readDocumentFacts(ctx, input.documentId),
    rowCount: 1,
  }),
});

export const INVOICES_AGENT_TOOLS = [readDocumentTool];
