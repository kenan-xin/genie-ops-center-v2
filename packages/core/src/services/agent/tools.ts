import {
  asSchema,
  type InvalidToolInputError,
  jsonSchema,
  NoSuchToolError,
  tool,
  type ToolSet,
} from "ai";
import { z } from "zod";

import {
  type AnyAgentTool,
  defineAgentTool,
} from "../../../contracts/index.ts";
import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { ASK_SURFACE } from "../../lib/module-contract/agent-tools.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { AuditAction } from "../audit/actions.ts";
import type { AuditMetadataValue } from "../audit/index.ts";
import { insertAuditRow } from "../audit/insert.ts";
import { can } from "../authorization/index.ts";
import { listDatasets, queryDataset, recordRoute } from "../datasets/index.ts";
import { datasetQuerySchema } from "../datasets/query.ts";
import {
  artifactTool,
  type ArtifactTurn,
  MAKE_ARTIFACT,
} from "./artifact-tool.ts";
import { fileTool, MAKE_FILE } from "./file-tool.ts";
import { type SessionTools, sessionTools } from "./surfaces.ts";

export const AGENT_TOOL_AUDIT_ACTION: AuditAction = "core:agent_tool_called";

/** One dataset as `list-datasets` answers it: the name and description first (R-43). */
type DatasetListing = {
  name: string;
  description: string;
  fields: Record<string, { kind: string; type: string; description: string }>;
  timeField: string;
  recordKeyField: string;
  currencyField?: string;
  summaryFields?: readonly string[];
};

const listDatasetsTool = defineAgentTool({
  name: "list-datasets",
  description:
    "Lists the datasets this person may read: each dataset's name and description first, then its fields with their kind, type and description, its time field, its record key field, its currency field and its summaryFields, the fields that every list of its rows shows.",
  input: z.strictObject({}),
  run: async (ctx) => {
    const datasets = (await listDatasets(ctx)).map((dataset) => {
      const entry: DatasetListing = {
        name: dataset.name,
        description: dataset.description,
        // A hidden field stays out, so every recorded request keeps matching (DEC-55).
        fields: Object.fromEntries(
          Object.entries(dataset.fields)
            .filter(([, field]) => field.hiddenFromAgent !== true)
            .map(([name, { kind, type, description }]) => [
              name,
              { kind, type, description },
            ])
        ),
        timeField: dataset.timeField,
        recordKeyField: dataset.recordKey.field,
      };

      if (dataset.currencyField !== undefined) {
        entry.currencyField = dataset.currencyField;
      }

      if (dataset.summaryFields !== undefined) {
        entry.summaryFields = dataset.summaryFields;
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

export const COULD_NOT_RUN = "The tool could not run.";

const CORE_TOOLS = [listDatasetsTool, queryDatasetTool, openRecordTool];

/** The dataset a core tool's input names, so a refused call's row still says what it tried. */
function datasetIn(input: AuditMetadataValue): string | null {
  const parsed = z.object({ dataset: z.string() }).safeParse(input);

  return parsed.success ? parsed.data.dataset : null;
}

/** The text the model reads for a refused call: the catalogue message and each issue's fix. */
export function refusalText(error: AppError): string {
  return [
    error.safeMessage,
    ...(error.issues ?? []).map(({ path, message }) => `${path}: ${message}`),
  ].join(" ");
}

/**
 * The one audit row of an agent tool call (R-47, DEC-29): the input and the row count, never the
 * returned values. A failed write keeps its database text from the model, like any other failure.
 */
export async function writeToolAudit(
  ctx: ModuleRequestContext,
  session: { readonly id: string },
  call: {
    readonly tool: string;
    readonly query: AuditMetadataValue;
    readonly outcome: string;
    readonly rowCount: number;
    readonly dataset: string | null;
  }
): Promise<void> {
  await insertAuditRow(ctx.tenant.db, {
    actorUserId: ctx.caller.userId,
    action: AGENT_TOOL_AUDIT_ACTION,
    targetType: call.dataset === null ? null : "dataset",
    targetId: call.dataset,
    summary: `Agent tool ${call.tool}${call.dataset === null ? "" : ` on ${call.dataset}`}`,
    metadata: {
      sessionId: session.id,
      tool: call.tool,
      dataset: call.dataset,
      query: call.query,
      rowCount: call.rowCount,
      outcome: call.outcome,
    },
  }).catch((cause: unknown) => {
    throw new Error(COULD_NOT_RUN, { cause });
  });
}

/**
 * The `repairToolCall` hook of the agent route (`czjw.31`): the AI SDK calls it once for each tool
 * call it refuses before `execute`: an unknown tool, or input that is not JSON. A module tool's
 * schema refusal reaches `audited` instead (`czjw.79`). It writes one refused audit row with the
 * raw input text and repairs nothing, so the model still gets the SDK's tool error.
 */
export function auditRefusedToolCall(
  ctx: ModuleRequestContext,
  session: { readonly id: string }
) {
  return async ({
    toolCall,
    error,
  }: {
    readonly toolCall: { readonly toolName: string; readonly input: string };
    readonly error: NoSuchToolError | InvalidToolInputError;
  }): Promise<null> => {
    await writeToolAudit(ctx, session, {
      tool: toolCall.toolName,
      query: toolCall.input,
      outcome: NoSuchToolError.isInstance(error)
        ? "unknown-tool"
        : "invalid-input",
      rowCount: 0,
      dataset: null,
    });

    return null;
  };
}

/**
 * One tool as the model gets it. `execute` runs the tool as `ctx.caller` and writes one audit row
 * per call with the input and the row count, never the returned values (R-47, DEC-29).
 *
 * The SDK gets the tool's own JSON schema with a validate that accepts every value, and `execute`
 * parses the input with the zod schema. So a refused input answers the model, the stored part and
 * the audit row with its field messages, as a chart gate refusal does, and not with the generic
 * error that the SDK raises for a schema refusal (`czjw.79`, I21 cause 1).
 */
function audited(
  ctx: ModuleRequestContext,
  session: { readonly id: string },
  agentTool: AnyAgentTool,
  core: boolean
) {
  return tool({
    description: agentTool.description,
    inputSchema: jsonSchema(() => asSchema(agentTool.input).jsonSchema, {
      validate: (value) => ({ success: true, value }),
    }),
    execute: async (input) => {
      const parsed = agentTool.input.safeParse(input);

      // SAFETY: the AI SDK parsed the input from the model's JSON text, and the tool's schema
      // answers JSON values, so either is a JSON value.
      const query = (
        parsed.success ? parsed.data : input
      ) as AuditMetadataValue;

      const named = core ? datasetIn(query) : null;

      const record = (
        outcome: string,
        rowCount: number,
        dataset: string | null
      ) =>
        writeToolAudit(ctx, session, {
          tool: agentTool.name,
          query,
          outcome,
          rowCount,
          dataset,
        });

      let result: Awaited<ReturnType<AnyAgentTool["run"]>>;

      try {
        if (!parsed.success) {
          throw new AppError(CORE_ERRORS["invalid-input"], {
            issues: parsed.error.issues.map(({ path, message }) => ({
              path: path.join("."),
              message,
            })),
          });
        }

        // SAFETY: validateModule checked the provision, and `parsed` is this tool's own schema's
        // answer, so the input is the type its `run` was defined against.
        result = await agentTool.run(ctx, parsed.data as never);
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

/**
 * The module tools and rules of one session's surface (`sessionTools`), the tools filtered to the
 * ones this person is offered: a tool with no `permission`, or one whose key the person holds.
 * `module-disabled` when the surface's module is off or declares no surface.
 */
export async function offeredSessionTools(
  ctx: ModuleRequestContext,
  surface: string = ASK_SURFACE
): Promise<SessionTools> {
  const [agentTools, surfaces] = await Promise.all([
    ctx.tenant.capabilities.list("agent-tools"),
    ctx.tenant.capabilities.list("agent-surface"),
  ]);

  const selected = sessionTools(surface, agentTools, surfaces);

  if (selected === undefined)
    throw new AppError(CORE_ERRORS["module-disabled"]);

  const held = await Promise.all(
    selected.moduleTools.map(({ permission }) =>
      permission === undefined ? true : can(ctx.caller, permission)
    )
  );

  return {
    ...selected,
    moduleTools: selected.moduleTools.filter(
      (_, index) => held[index] === true
    ),
  };
}

/** Ask's module tools that this person is offered, in registration order. */
export async function offeredModuleTools(
  ctx: ModuleRequestContext
): Promise<readonly AnyAgentTool[]> {
  return (await offeredSessionTools(ctx)).moduleTools;
}

/** Whether this person is offered a module tool that changes data, which switches the prompt's write rule. */
export async function offersWriteTool(
  ctx: ModuleRequestContext,
  surface: string = ASK_SURFACE
): Promise<boolean> {
  return (await offeredSessionTools(ctx, surface)).moduleTools.some(
    ({ writes }) => writes === true
  );
}

/**
 * The model's tools for one request: the core read tools, `make-artifact`, `make-file` on Ask
 * only, then the session's offered module tools in order.
 */
export async function agentToolSet(
  ctx: ModuleRequestContext,
  session: { readonly id: string; readonly surface?: string },
  turn: ArtifactTurn
): Promise<ToolSet> {
  const { files, moduleTools } = await offeredSessionTools(
    ctx,
    session.surface
  );

  return Object.fromEntries([
    ...CORE_TOOLS.map((entry) => [
      entry.name,
      audited(ctx, session, entry, true),
    ]),
    [MAKE_ARTIFACT, artifactTool(ctx, session, turn)],
    ...(files ? [[MAKE_FILE, fileTool(ctx, session)]] : []),
    ...moduleTools.map((entry) => [
      entry.name,
      audited(ctx, session, entry, false),
    ]),
  ]);
}
