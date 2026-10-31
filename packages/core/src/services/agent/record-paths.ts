import { omit } from "es-toolkit";

import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { CheckedChart } from "../charts/index.ts";
import { listDatasets, recordRoute } from "../datasets/index.ts";

/**
 * An answer's records table opens each row's record (R-44, S7-11 D3). When a table selects its
 * dataset's record key field, each row's page is resolved through the record route as the viewer,
 * so a row that the viewer may not open answers null, and the key column is not drawn. Every other
 * chart is answered unchanged.
 */
export async function withRecordPaths(
  ctx: ModuleRequestContext,
  checked: CheckedChart
): Promise<CheckedChart> {
  const { config, data } = checked;
  const [series] = config.series;

  if (config.type !== "table" || series === undefined) return checked;

  const declared = (await listDatasets(ctx)).find(
    ({ name }) => name === series.dataset
  );

  const key = declared?.recordKey.field;

  if (key === undefined || !data.columns.some((column) => column.key === key)) {
    return checked;
  }

  // shortcut: one resolver read per row; batch the reads when a records table grows past a few hundred rows.
  const recordPaths = await Promise.all(
    data.rows.map(async (row) => {
      const id = row[key] ?? null;

      if (id === null) return null;

      const route = await recordRoute(ctx, {
        dataset: series.dataset,
        id: String(id),
      });

      return route?.path ?? null;
    })
  );

  return {
    config,
    data: {
      ...data,
      columns: data.columns.filter((column) => column.key !== key),
      rows: data.rows.map((row) => omit(row, [key])),
      recordPaths,
    },
  };
}
