import { z } from "zod";

import { DOCUMENT_KINDS } from "../../schema.ts";

/**
 * The answer the model must give (the structured-output schema, R-24). It holds no formats on
 * purpose: a badly formed value is dropped by the quote check instead of failing the whole answer.
 * A field the document does not state is null as a whole, never in parts: Anthropic refuses a
 * schema with more than 16 union-typed parameters, and each nullable part counts as one (czjw.57).
 */
const quoted = z.object({
  value: z.string(),
  quote: z.string(),
  page: z.number().int(),
});

export const modelReading = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  customer: quoted.nullable(),
  number: quoted.nullable(),
  date: quoted.nullable(),
  dueDate: quoted.nullable(),
  paymentTerms: quoted.nullable(),
  currency: quoted.nullable(),
  amount: quoted.nullable(),
  reference: quoted.nullable(),
  method: quoted.nullable(),
  description: quoted.nullable(),
  invoiceNumbers: z.array(quoted),
});

export type ModelReading = z.infer<typeof modelReading>;
