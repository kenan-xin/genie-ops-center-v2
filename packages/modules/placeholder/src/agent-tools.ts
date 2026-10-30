import { queryDataset } from "@genie/core";
import { defineAgentTool } from "@genie/core/contracts";
import { z } from "zod";

import { recordsDataset } from "./datasets.ts";

/** The module's one agent tool (R-43): a count through the dataset service, as the person who asks. */
export const countRecordsTool = defineAgentTool({
  name: "placeholder-count-records",
  description:
    "Counts the placeholder records this person may read, as of the reporting date.",
  input: z.strictObject({}),
  run: async (ctx) => {
    const { rows, asOf } = await queryDataset(ctx, {
      dataset: recordsDataset.name,
      query: { aggregates: [{ fn: "count", as: "records" }] },
    });

    return {
      output: { records: rows[0]?.records ?? 0, asOf },
      rowCount: rows.length,
      dataset: recordsDataset.name,
    };
  },
});
