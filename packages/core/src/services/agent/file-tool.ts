import { asSchema, jsonSchema, type Tool, tool } from "ai";
import { z } from "zod";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { ModuleRequestContext } from "../../lib/module-contract/module.ts";
import type { AuditMetadataValue } from "../audit/index.ts";
import { checkDatasetRead } from "../datasets/index.ts";
import { datasetQuerySchema } from "../datasets/query.ts";
import { enqueueJob } from "../job-queue/module-jobs.ts";
import { AGENT_FILE_JOB } from "./file-job.ts";
import { FILE_FORMATS } from "./file-kinds.ts";
import { createAgentFile, deleteAgentFile } from "./files.ts";
import { COULD_NOT_RUN, refusalText, writeToolAudit } from "./tools.ts";

/**
 * The `make-file` tool (R-44a, S7-35): it checks the read as the person, records the file and
 * queues the core job that makes it, then answers at once, so the chat goes on. Its output holds no
 * id, because the next turn's request holds every tool output and recordings match it whole.
 */

export const MAKE_FILE = "make-file";

const DESCRIPTION =
  "Makes a file of every row of one dataset query, as this person, for the person to download: csv, xlsx (an Excel workbook), md (a Markdown table) or pdf. A background job makes it, so the chat goes on, and the chat shows a Download button when the file is ready. Use it when the person asks for a file, a download or an export. Use the format the person names. If they name none, use xlsx for a list with amounts or counts, and csv for any other list. A query holds select or aggregates, with optional filters, groupBy and orderBy. Leave out limit unless the person asks for the first rows. Answers the file's title, its format and that it is being made.";

const inputSchema = z.strictObject({
  title: z
    .string()
    .min(1)
    .describe("The file name without an extension, for example All invoices."),
  format: z.enum(FILE_FORMATS).describe("csv, xlsx, md or pdf."),
  dataset: z.string().describe("The dataset name that list-datasets answers."),
  query: datasetQuerySchema,
});

function datasetIn(input: AuditMetadataValue): string | null {
  const parsed = z.object({ dataset: z.string() }).safeParse(input);

  return parsed.success ? parsed.data.dataset : null;
}

export function fileTool(
  ctx: ModuleRequestContext,
  session: { readonly id: string }
): Tool {
  return tool({
    description: DESCRIPTION,
    // The input is parsed inside `execute`, so a refusal answers with its field messages (PC11).
    inputSchema: jsonSchema(() => asSchema(inputSchema).jsonSchema, {
      validate: (value) => ({ success: true, value }),
    }),
    execute: async (input, { toolCallId }) => {
      const parsed = inputSchema.safeParse(input);

      // SAFETY: the AI SDK parsed the input from the model's JSON text, so it is a JSON value.
      const query = (
        parsed.success ? parsed.data : input
      ) as AuditMetadataValue;

      const named = datasetIn(query);

      const record = (outcome: string) =>
        writeToolAudit(ctx, session, {
          tool: MAKE_FILE,
          query,
          outcome,
          rowCount: 0,
          dataset: named,
        });

      try {
        if (!parsed.success) {
          throw new AppError(CORE_ERRORS["invalid-input"], {
            issues: parsed.error.issues.map(({ path, message }) => ({
              path: path.join("."),
              message,
            })),
          });
        }

        const { title, format, dataset } = parsed.data;

        const checked = await checkDatasetRead(ctx, {
          dataset,
          query: parsed.data.query,
        });

        const agentFileId = await createAgentFile(ctx, {
          sessionId: session.id,
          toolCallId,
          title,
          format,
          dataset,
          query: checked.query,
        });

        try {
          await enqueueJob(ctx, AGENT_FILE_JOB, { agentFileId });
        } catch (error) {
          // No job will ever make this row, so it goes; otherwise the chat shows "Making" forever.
          await deleteAgentFile(ctx, agentFileId);

          throw error;
        }
      } catch (error) {
        if (error instanceof AppError) {
          await record(error.code);

          throw new Error(refusalText(error), { cause: error });
        }

        await record("failed");

        throw new Error(COULD_NOT_RUN, { cause: error });
      }

      await record("queued");

      return {
        title: parsed.data.title,
        format: parsed.data.format,
        state: "making",
      };
    },
  });
}
