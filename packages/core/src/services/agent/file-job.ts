import type { ChartColumn, ChartRow } from "@genie/ui";
import { eq } from "drizzle-orm";
import { omit } from "es-toolkit";

import { AppError } from "../../lib/errors/index.ts";
import type {
  JobContext,
  JobDeclaration,
  ModuleRequestContext,
} from "../../lib/module-contract/module.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import { agentFile, agentSession } from "../../schema.ts";
import type { AuditAction } from "../audit/actions.ts";
import type { AuditMetadataValue } from "../audit/index.ts";
import { insertAuditRow } from "../audit/insert.ts";
import { tableColumns } from "../charts/index.ts";
import {
  checkDatasetRead,
  type DatasetResult,
  queryDataset,
} from "../datasets/index.ts";
import type { DatasetCursor, DatasetQuery } from "../datasets/query.ts";
import { fileBytes, fileNameOf } from "./file-formats.ts";

/**
 * The core job that makes a chat's list file (R-44a, `DEC-12`). It runs as the person who asked,
 * with the grants of the run (R-12, `DEC-48`), reads every page of the query, stores the bytes
 * through `FileStorage`, and writes one audit row with the row count and no value (R-47).
 */

export const AGENT_FILE_MADE_ACTION: AuditAction = "core:agent_file_made";

/** An aggregate query that the row cap cut: a file of part of the groups would mislead. */
class TooManyRows extends Error {}

const TOO_MANY_ROWS = "too-many-rows";

/**
 * Every row of a query as the caller, page after page with the dataset cursor. A query with its own
 * limit reads one page. The record key column is dropped when other columns hold the row's name, as
 * the chat's table does.
 */
export async function readEveryRow(
  ctx: ModuleRequestContext,
  input: { readonly dataset: string; readonly query: DatasetQuery }
): Promise<{
  readonly columns: readonly ChartColumn[];
  readonly rows: readonly ChartRow[];
}> {
  const { declaration, query } = await checkDatasetRead(ctx, input);

  const rows: ChartRow[] = [];
  let first: DatasetResult | undefined;
  let after: DatasetCursor | undefined;

  /* oxlint-disable no-await-in-loop -- each page starts after the last row of the one before. */
  for (;;) {
    const page = await queryDataset(ctx, {
      dataset: input.dataset,
      query,
      after,
    });

    first ??= page;
    rows.push(...page.rows);

    if (query.limit !== undefined || !page.truncated) break;

    // A cut row query answers where the next page starts; a cut aggregate answers none.
    if (page.next === undefined) throw new TooManyRows();

    after = page.next;
  }
  /* oxlint-enable no-await-in-loop */

  if (first === undefined) throw new Error("The read answered no page.");

  const columns = tableColumns(first, declaration, query.aggregates);
  const key = declaration.recordKey.field;

  if (columns.length < 2 || !columns.some((column) => column.key === key)) {
    return { columns, rows };
  }

  return {
    columns: columns.filter((column) => column.key !== key),
    rows: rows.map((row) => omit(row, [key])),
  };
}

type FileRow = typeof agentFile.$inferSelect & { readonly userId: string };

async function audit(
  db: ModuleRequestContext["tenant"]["db"] | TenantTransaction,
  actorUserId: string | null,
  row: FileRow,
  made: {
    readonly outcome: string;
    readonly rowCount: number | null;
    readonly fileId: string | null;
  }
): Promise<void> {
  await insertAuditRow(db, {
    actorUserId,
    action: AGENT_FILE_MADE_ACTION,
    targetType: made.fileId === null ? null : "file",
    targetId: made.fileId,
    summary: `Agent file ${row.format} of ${row.dataset}`,
    metadata: {
      sessionId: row.sessionId,
      agentFileId: row.id,
      dataset: row.dataset,
      // SAFETY: the query was parsed and stored as JSON, so it is a JSON value.
      query: row.query as AuditMetadataValue,
      format: row.format,
      rowCount: made.rowCount,
      outcome: made.outcome,
    },
  });
}

/**
 * Makes one file. A run that finds the file made or failed does nothing, so a retry adds no second
 * file. A refusal (an `AppError`) or a cut aggregate marks the file failed and ends the job; any
 * other error marks it failed and is thrown, so the worker logs it.
 */
async function makeAgentFile(
  ctx: JobContext,
  agentFileId: string
): Promise<void> {
  const { db } = ctx.tenant;

  const [row] = await db
    .select({ file: agentFile, userId: agentSession.userId })
    .from(agentFile)
    .innerJoin(agentSession, eq(agentSession.id, agentFile.sessionId))
    .where(eq(agentFile.id, agentFileId));

  if (row === undefined) return;

  const found: FileRow = { ...row.file, userId: row.userId };

  if (found.state === "ready" || found.state === "failed") return;

  const setState = (state: "running" | "failed") =>
    db
      .update(agentFile)
      .set({ state, updatedAt: new Date() })
      .where(eq(agentFile.id, found.id));

  const { caller } = ctx;

  // Only the person who asked makes their own file.
  if (caller === undefined || caller.userId !== found.userId) {
    await setState("failed");
    await audit(db, caller?.userId ?? null, found, {
      outcome: "forbidden",
      rowCount: null,
      fileId: null,
    });

    return;
  }

  await setState("running");

  try {
    const table = await readEveryRow(
      { tenant: ctx.tenant, caller },
      { dataset: found.dataset, query: found.query }
    );

    const { bytes, mimeType } = await fileBytes(found.format, {
      title: found.title,
      ...table,
    });

    await withTransaction(ctx.tenant, async (tx) => {
      const stored = await ctx.tenant.fileStorage.store(
        {
          fileName: fileNameOf(found.title, found.format),
          mimeType,
          bytes,
          uploadedByUserId: found.userId,
        },
        tx
      );

      await tx
        .update(agentFile)
        .set({
          state: "ready",
          fileId: stored.id,
          rowCount: table.rows.length,
          updatedAt: new Date(),
        })
        .where(eq(agentFile.id, found.id));

      await audit(tx, caller.userId, found, {
        outcome: "made",
        rowCount: table.rows.length,
        fileId: stored.id,
      });
    });
  } catch (error) {
    const outcome =
      error instanceof AppError
        ? error.code
        : error instanceof TooManyRows
          ? TOO_MANY_ROWS
          : "failed";

    await setState("failed");
    await audit(db, caller.userId, found, {
      outcome,
      rowCount: null,
      fileId: null,
    });

    if (outcome === "failed") throw error;
  }
}

export const AGENT_FILE_JOB: JobDeclaration<{ readonly agentFileId: string }> =
  {
    name: "core.agent-file",
    handler: async (ctx, { agentFileId }) => makeAgentFile(ctx, agentFileId),
  };
