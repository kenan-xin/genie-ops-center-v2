import type { TenantContext } from "@genie/core";

import { readWithModel } from "../src/services/reading/model-reading.ts";
import { checkReading } from "../src/services/reading/quote-check.ts";
import { extractTextLayer } from "../src/services/reading/text-layer.ts";

/** A reading as the quote check keeps it, in plain text: what the model evaluation scores. */
export type LiveReading = {
  readonly kind: string;
  readonly fields: { readonly [field: string]: string | undefined };
  readonly invoiceNumbers: readonly string[];
};

/**
 * Reads one PDF the way the reading job does: its text layer, the document model's structured
 * reading (R-24), then the quote check (R-25). For the model evaluation (S7-14), which scores the
 * kept values; it stores nothing.
 */
export async function readLiveUpload(
  tenant: TenantContext,
  pdf: Uint8Array
): Promise<LiveReading> {
  const { pages } = await extractTextLayer(pdf);
  const output = await readWithModel(tenant, { pages, pdf });
  const kept = checkReading(output, pages);

  return {
    kind: output.kind,
    fields: Object.fromEntries(
      Object.entries(kept.fields).map(([field, item]) => [field, item?.value])
    ),
    invoiceNumbers: kept.invoiceNumbers.map((item) => item.value),
  };
}
