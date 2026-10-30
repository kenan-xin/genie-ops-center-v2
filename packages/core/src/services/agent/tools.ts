import { tool, type ToolSet } from "ai";
import { z } from "zod";

import {
  type AgentToolsProvider,
  type AnyAgentTool,
  defineAgentTool,
} from "../../../contracts/index.ts";
import { AppError } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { AuditAction } from "../audit/actions.ts";
import type { AuditMetadataValue } from "../audit/index.ts";
import { insertAuditRow } from "../audit/insert.ts";
import { listDatasets, queryDataset, recordRoute } from "../datasets/index.ts";
import { datasetQuerySchema } from "../datasets/query.ts";

export const AGENT_TOOL_AUDIT_ACTION: AuditAction = "core:agent_tool_called";

/** One dataset as `list-datasets` answers it: the name and description first (R-43). */
type DatasetListing = {
  name: string;
  description: string;
  fields: Record<string, { kind: string; type: string; description: string }>;
  timeField: string;
  recordKeyField: string;
  currencyField?: string;
};

const listDatasetsTool = defineAgentTool({
  name: "list-datasets",
  description:
    "Lists the datasets this person may read: each dataset's name and description first, then its fields with their kind, type and description, its time field, its record key field and its currency field.",
  input: z.strictObject({}),
  run: async (ctx) => {
    const datasets = (await listDatasets(ctx)).map((dataset) => {
      const entry: DatasetListing = {
        name: dataset.name,
        description: dataset.description,
        fields: Object.fromEntries(
          Object.entries(dataset.fields).map(
            ([name, { kind, type, description }]) => [
              name,
              { kind, type, description },
            ]
          )
        ),
        timeField: dataset.timeField,
        recordKeyField: dataset.recordKey.field,
      };

      if (dataset.currencyField !== undefined) {
        entry.currencyField = dataset.currencyField;
      }

      return entry;
    });

    return { output: { datasets }, rowCount: datasets.length };
  },
});

const queryDatasetTool = defineAgentTool({
  name: "query-dataset",
  description:
    "Runs one query on one dataset as this person, as of the reporting date. A query holds select or aggregates, with optional filters, groupBy, orderBy and limit, and answers at most 1,000 rows.",
  input: z.strictObject({
    dataset: z.string().min(1),
    query: datasetQuerySchema,
  }),
  run: async (ctx, input) => {
    // The read instant is a clock value; a recording matches the whole request body (R-9).
    const { readAt: _readAt, ...output } = await queryDataset(ctx, input);

    return { output, rowCount: output.rows.length, dataset: output.dataset };
  },
});

const openRecordTool = defineAgentTool({
  name: "open-record",
  description:
    "Finds the page of the record behind one dataset row: give the dataset and the value of its record key field. Answers the record's label and path, or that this person cannot open it.",
  input: z.strictObject({
    dataset: z.string().min(1),
    id: z.string().min(1),
  }),
  run: async (ctx, input) => {
    const route = await recordRoute(ctx, input);

    return route === null
      ? { output: { found: false }, rowCount: 0, dataset: input.dataset }
      : {
          output: { label: route.label, path: route.path },
          rowCount: 1,
          dataset: input.dataset,
        };
  },
});

const COULD_NOT_RUN = "The tool could not run.";

const CORE_TOOLS = [listDatasetsTool, queryDatasetTool, openRecordTool];

/** The dataset a core tool's input names, so a refused call's row still says what it tried. */
function datasetIn(input: AuditMetadataValue): string | null {
  const parsed = z.object({ dataset: z.string() }).safeParse(input);

  return parsed.success ? parsed.data.dataset : null;
}

/** The text the model reads for a refused call: the catalogue message and each issue's fix. */
function refusalText(error: AppError): string {
  return [
    error.safeMessage,
    ...(error.issues ?? []).map(({ path, message }) => `${path}: ${message}`),
  ].join(" ");
}

/**
 * One tool as the model gets it. `execute` runs the tool as `ctx.caller` and writes one audit row
 * per call with the input and the row count, never the returned values (R-47, DEC-29).
 */
function audited(
  ctx: ModuleRequestContext,
  session: { readonly id: string },
  agentTool: AnyAgentTool,
  core: boolean
) {
  return tool({
    description: agentTool.description,
    inputSchema: agentTool.input,
    execute: async (input) => {
      // SAFETY: the AI SDK parsed the input from the model's JSON with the tool's own schema, so
      // it is a JSON value.
      const query = input as AuditMetadataValue;
      const named = core ? datasetIn(query) : null;

      const record = async (
        outcome: string,
        rowCount: number,
        dataset: string | null
      ) =>
        // A failed write keeps its database text from the model, like any other failure.
        insertAuditRow(ctx.tenant.db, {
          actorUserId: ctx.caller.userId,
          action: AGENT_TOOL_AUDIT_ACTION,
          targetType: dataset === null ? null : "dataset",
          targetId: dataset,
          summary: `Agent tool ${agentTool.name}${dataset === null ? "" : ` on ${dataset}`}`,
          metadata: {
            sessionId: session.id,
            tool: agentTool.name,
            dataset,
            query,
            rowCount,
            outcome,
          },
        }).catch((cause: unknown) => {
          throw new Error(COULD_NOT_RUN, { cause });
        });

      let result: Awaited<ReturnType<AnyAgentTool["run"]>>;

      try {
        // SAFETY: validateModule checked the provision, and the AI SDK parsed the input with this
        // tool's own schema, so the input is the type its `run` was defined against.
        result = await agentTool.run(ctx, input as never);
      } catch (error) {
        if (error instanceof AppError) {
          await record(error.code, 0, named);

          throw new Error(refusalText(error), { cause: error });
        }

        await record("failed", 0, named);

        throw new Error(COULD_NOT_RUN, { cause: error });
      }

      await record("answered", result.rowCount, result.dataset ?? named);

      return result.output;
    },
  });
}

/** The model's tools for one request: the three core tools, then every enabled provider's tools in registration order. */
export async function agentToolSet(
  ctx: ModuleRequestContext,
  session: { readonly id: string }
): Promise<ToolSet> {
  const providers = await ctx.tenant.capabilities.list("agent-tools");

  // SAFETY: validateModule checked each agent-tools provision against AgentToolsProvider before
  // the registry took it, and `list` answers only providers of that name.
  const moduleTools = providers.flatMap(
    ({ implementation }) => (implementation as AgentToolsProvider).tools
  );

  return Object.fromEntries([
    ...CORE_TOOLS.map((entry) => [
      entry.name,
      audited(ctx, session, entry, true),
    ]),
    ...moduleTools.map((entry) => [
      entry.name,
      audited(ctx, session, entry, false),
    ]),
  ]);
}
