import { z } from "zod";

import { DOCUMENT_KINDS } from "../../schema.ts";

/**
 * The answer the model must give (the structured-output schema, R-24). It holds no formats on
 * purpose: a badly formed value is dropped by the quote check instead of failing the whole answer.
 */
const quoted = z.object({
  value: z.string().nullable(),
  quote: z.string().nullable(),
  page: z.number().int().nullable(),
});

export const modelReading = z.object({
  kind: z.enum(DOCUMENT_KINDS),
  customer: quoted,
  number: quoted,
  date: quoted,
  dueDate: quoted,
  paymentTerms: quoted,
  currency: quoted,
  amount: quoted,
  reference: quoted,
  method: quoted,
  description: quoted,
  invoiceNumbers: z.array(
    z.object({ value: z.string(), quote: z.string(), page: z.number().int() })
  ),
});

export type ModelReading = z.infer<typeof modelReading>;
