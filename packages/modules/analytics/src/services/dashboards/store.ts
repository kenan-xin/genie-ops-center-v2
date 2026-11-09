import { isDeepStrictEqual } from "node:util";

import {
  AppError,
  checkChart,
  CORE_ERRORS,
  moduleAudit,
  type ModuleRequestContext,
  type PanelConfig,
  panelConfigSchema,
  type TenantTransaction,
  withTransaction,
} from "@genie/core";
import { and, desc, eq, ne, sql } from "drizzle-orm";

import {
  type DashboardConfig,
  type StoredPanel,
  dashboardConfigSchema,
  EMPTY_DASHBOARD_CONFIG,
  storedDashboardConfig,
  type UndoEntry,
} from "../../config.ts";
import type {
  DashboardChange,
  DashboardSummary,
  FilterField,
} from "../../contract.ts";
import { ANALYTICS_ERRORS } from "../../errors.ts";
import type { DashboardView } from "../../presentation/views.ts";
import { dashboard } from "../../schema.ts";
import { applyChanges, pushUndo } from "./changes.ts";

export type DashboardRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly config: DashboardConfig;
  readonly undo: readonly UndoEntry[];
  readonly version: number;
  readonly updatedAt: Date;
};

const audit = moduleAudit("analytics");

const RECORD = {
  id: dashboard.id,
  ownerUserId: dashboard.ownerUserId,
  name: dashboard.name,
  config: dashboard.config,
  undo: dashboard.undo,
  version: dashboard.version,
  updatedAt: dashboard.updatedAt,
};

/** The caller's own row. The id compares as text, so an id that is not a uuid finds nothing (R-48). */
const own = (ctx: ModuleRequestContext, id: string) =>
  and(
    eq(dashboard.ownerUserId, ctx.caller.userId),
    sql`${dashboard.id}::text = ${id}`
  );

const notFound = () => new AppError(CORE_ERRORS["not-found"]);

const targetOf = (id: string) => ({ type: "analytics-dashboard", id });

export function viewOf(
  record: DashboardRecord,
  filterFields: readonly FilterField[]
): DashboardView {
  return {
    id: record.id,
    name: record.name,
    version: record.version,
    canUndo: record.undo.length > 0,
    filters: record.config.filters,
    filterFields,
    panels: record.config.panels,
  };
}

/**
 * A row as the server reads it: `jsonb.$type` types the column without parsing it, so the parse
 * here is what reads a row written before the field filters were a list (P15-2). The undo entries
 * are parsed only where a save or an Undo uses them, so a panel's 10-second poll stays cheap.
 */
function parseRow(row: DashboardRecord): DashboardRecord {
  return { ...row, config: storedDashboardConfig.parse(row.config) };
}

/** The undo entries of a row as the server reads them (P15-2). */
function parseUndo(row: DashboardRecord): DashboardRecord {
  return {
    ...row,
    undo: row.undo.map((entry) => ({
      ...entry,
      config: storedDashboardConfig.parse(entry.config),
    })),
  };
}

/** The caller's own dashboards, the last changed first. Another owner's row never reads (R-48). */
export async function listOwnDashboards(
  ctx: ModuleRequestContext
): Promise<DashboardSummary[]> {
  const rows = await ctx.tenant.db
    .select({
      id: dashboard.id,
      name: dashboard.name,
      panelCount: sql<number>`jsonb_array_length(${dashboard.config} -> 'panels')`,
      updatedAt: dashboard.updatedAt,
    })
    .from(dashboard)
    .where(eq(dashboard.ownerUserId, ctx.caller.userId))
    .orderBy(desc(dashboard.updatedAt), desc(dashboard.id));

  return rows.map(({ id, name, panelCount, updatedAt }) => ({
    id,
    name,
    panelCount,
    updatedAt: updatedAt.toISOString(),
  }));
}

/** The caller's own dashboards with their configs, in the order of `listOwnDashboards` (R-48). */
export async function listOwnRecords(
  ctx: ModuleRequestContext
): Promise<DashboardRecord[]> {
  const rows = await ctx.tenant.db
    .select(RECORD)
    .from(dashboard)
    .where(eq(dashboard.ownerUserId, ctx.caller.userId))
    .orderBy(desc(dashboard.updatedAt), desc(dashboard.id));

  return rows.map(parseRow);
}

export async function readOwnDashboard(
  ctx: ModuleRequestContext,
  id: string
): Promise<DashboardRecord> {
  const [row] = await ctx.tenant.db
    .select(RECORD)
    .from(dashboard)
    .where(own(ctx, id));

  if (row === undefined) throw notFound();

  return parseRow(row);
}

export async function createDashboard(
  ctx: ModuleRequestContext,
  input: { readonly name: string }
): Promise<DashboardRecord> {
  return withTransaction(ctx.tenant, (tx) =>
    insertOwnDashboard(ctx, tx, input)
  );
}

/**
 * Inserts an empty dashboard of the caller and its created audit row through `tx`, which the caller
 * owns: `createDashboard`, and the Dashboards surface's `createRecord` inside the handoff's
 * transaction.
 */
export async function insertOwnDashboard(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  input: { readonly name: string }
): Promise<DashboardRecord> {
  const [row] = await tx
    .insert(dashboard)
    .values({
      ownerUserId: ctx.caller.userId,
      name: input.name,
      config: EMPTY_DASHBOARD_CONFIG,
    })
    .onConflictDoNothing()
    .returning(RECORD);

  // The only unique key besides the generated id is the owner's name (`dashboard_owner_name_key`).
  if (row === undefined) {
    throw new AppError(ANALYTICS_ERRORS["dashboard-name-taken"]);
  }

  await audit(
    { tenant: ctx.tenant, caller: ctx.caller, tx },
    "analytics:dashboard-created",
    targetOf(row.id),
    "Created a dashboard."
  );

  return row;
}

/** The caller's own row as it stands before the gate, refused when the caller saw an older version. */
async function readForWrite(
  ctx: ModuleRequestContext,
  id: string,
  expectedVersion: number | undefined
): Promise<DashboardRecord> {
  const row = parseUndo(await readOwnDashboard(ctx, id));

  if (expectedVersion !== undefined && expectedVersion !== row.version) {
    throw new AppError(ANALYTICS_ERRORS["dashboard-changed"]);
  }

  return row;
}

/**
 * Locks the own row and requires the version that was read before the gate, so a save that
 * landed in between is refused, never overwritten (B2.5). Also without `expectedVersion`.
 */
async function lockSameVersion(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  row: DashboardRecord
): Promise<void> {
  const [locked] = await tx
    .select({ version: dashboard.version })
    .from(dashboard)
    .where(own(ctx, row.id))
    .for("update");

  if (locked === undefined) throw notFound();

  if (locked.version !== row.version) {
    throw new AppError(ANALYTICS_ERRORS["dashboard-changed"]);
  }
}

/**
 * The unique index refuses a name the owner already uses, whatever its case and outer spaces;
 * this check answers the catalogue refusal instead of the raw database error.
 * shortcut: two saves of one owner that race to one new name still meet the index (a 500), rare
 * enough for a person's own dashboards; upgrade to a savepoint insert if it shows up.
 */
async function assertNameFree(
  ctx: ModuleRequestContext,
  tx: TenantTransaction,
  row: DashboardRecord,
  name: string
): Promise<void> {
  if (name === row.name) return;

  const [taken] = await tx
    .select({ id: dashboard.id })
    .from(dashboard)
    .where(
      and(
        eq(dashboard.ownerUserId, ctx.caller.userId),
        ne(dashboard.id, row.id),
        sql`lower(btrim(${dashboard.name})) = lower(btrim(${name}))`
      )
    );

  if (taken !== undefined) {
    throw new AppError(ANALYTICS_ERRORS["dashboard-name-taken"]);
  }
}

/** The chart gate, with each refused issue moved under `prefix` (R-15, R-49). */
async function gate(
  ctx: ModuleRequestContext,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a raw panel config; the gate is its parser
  config: unknown,
  prefix: string
): Promise<PanelConfig> {
  try {
    return (await checkChart(ctx, config)).config;
  } catch (cause) {
    if (!(cause instanceof AppError) || cause.code !== "chart-invalid") {
      throw cause;
    }

    throw new AppError(CORE_ERRORS["chart-invalid"], {
      issues: (cause.issues ?? []).map(({ path, message }) => ({
        path: `${prefix}${path}`,
        message,
      })),
    });
  }
}

/**
 * The draft when it differs from the stored panel only in its title, else `undefined`. A rename
 * reads no data, so it skips the gate (plan D2). Both sides are parsed, so a stored panel that the
 * schema normalizes compares equal; a draft that does not parse goes to the gate for its refusal.
 */
function titleOnly(
  stored: PanelConfig | undefined,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- a raw panel config; the schema is its parser
  draft: unknown
): PanelConfig | undefined {
  const before = panelConfigSchema.safeParse(stored);
  const after = panelConfigSchema.safeParse(draft);

  if (!before.success || !after.success) return undefined;

  return isDeepStrictEqual(
    { ...after.data, title: before.data.title },
    before.data
  )
    ? after.data
    : undefined;
}

async function save(
  tx: TenantTransaction,
  row: DashboardRecord,
  next: { readonly name: string; readonly config: DashboardConfig },
  undo: readonly UndoEntry[]
): Promise<DashboardRecord> {
  const [saved] = await tx
    .update(dashboard)
    .set({
      name: next.name,
      config: dashboardConfigSchema.parse(next.config),
      undo,
      version: row.version + 1,
      updatedAt: sql`now()`,
    })
    .where(eq(dashboard.id, row.id))
    .returning(RECORD);

  // `lockSameVersion` locked the row in this transaction, so the update finds it.
  if (saved === undefined) throw new Error("the locked dashboard is gone");

  return saved;
}

/**
 * Applies the steps to the caller's own dashboard. Each added or changed panel passes the chart
 * gate, except a stored panel whose only change is its title (D2); a panel no step touched is kept
 * as stored, so one broken panel blocks no other change (D2, Review Focus 2). Without `expectedVersion` the steps apply to the version read here.
 *
 * The gate runs before the transaction, so no save holds a row lock and a second pool connection
 * while chart queries run. The transaction then locks the row and refuses `dashboard-changed`
 * if another save moved its version since the read.
 */
export async function changeDashboard(
  ctx: ModuleRequestContext,
  input: {
    readonly id: string;
    readonly expectedVersion?: number;
    readonly changes: readonly DashboardChange[];
  }
): Promise<DashboardRecord> {
  const row = await readForWrite(ctx, input.id, input.expectedVersion);

  const applied = applyChanges(
    { name: row.name, config: row.config },
    input.changes
  );

  const stored = new Map(row.config.panels.map((panel) => [panel.id, panel]));
  const checked = new Map<string, PanelConfig>();

  for (const [id, step] of applied.checks) {
    const draft = applied.panels.find((panel) => panel.id === id);

    checked.set(
      id,
      titleOnly(stored.get(id)?.config, draft?.config) ??
        // One at a time, so a refusal always names the same step.
        // oxlint-disable-next-line no-await-in-loop
        (await gate(ctx, draft?.config, `changes.${step}.panel.`))
    );
  }

  const panels = applied.panels.map(({ id, layout, ownRange }) => {
    const config = checked.get(id) ?? stored.get(id)?.config;

    // Every new or changed config was checked above; any other panel is a stored one.
    if (config === undefined) throw new Error(`panel ${id} has no config`);

    const panel: StoredPanel = { id, layout, config };

    // The save writes `dashboardConfigSchema`, so the key stays absent until a range is set.
    return ownRange === undefined ? panel : { ...panel, ownRange };
  });

  return withTransaction(ctx.tenant, async (tx) => {
    await lockSameVersion(ctx, tx, row);
    await assertNameFree(ctx, tx, row, applied.name);

    const saved = await save(
      tx,
      row,
      { name: applied.name, config: { filters: applied.filters, panels } },
      pushUndo(row.undo, { name: row.name, config: row.config })
    );

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "analytics:dashboard-changed",
      targetOf(row.id),
      "Changed a dashboard.",
      { version: saved.version, steps: input.changes.length }
    );

    return saved;
  });
}

/**
 * Restores the newest save. Each panel it brings back passes the chart gate, so Undo never
 * restores a broken chart; a panel stored the same now, or the same but for its title, skips the
 * gate, so one broken panel blocks no Undo and a rename can always be undone (D1, D2, Review
 * Focus 2). The gate runs before the transaction, as in a change.
 */
export async function undoDashboard(
  ctx: ModuleRequestContext,
  input: { readonly id: string; readonly expectedVersion: number }
): Promise<DashboardRecord> {
  const row = await readForWrite(ctx, input.id, input.expectedVersion);
  const [entry, ...rest] = row.undo;

  if (entry === undefined) {
    throw new AppError(ANALYTICS_ERRORS["nothing-to-undo"]);
  }

  // Both sides come from jsonb, which stores object keys in one fixed order, so equal configs
  // print the same text.
  const current = new Map(
    row.config.panels.map(({ id, config }) => [id, config])
  );

  const panels: StoredPanel[] = [];

  for (const [index, panel] of entry.config.panels.entries()) {
    const now = current.get(panel.id);
    const unchanged = JSON.stringify(now) === JSON.stringify(panel.config);

    panels.push({
      ...panel,
      config: unchanged
        ? panel.config
        : (titleOnly(now, panel.config) ??
          // One at a time, so a refusal always names the same panel.
          // oxlint-disable-next-line no-await-in-loop
          (await gate(ctx, panel.config, `panels.${index}.config.`))),
    });
  }

  return withTransaction(ctx.tenant, async (tx) => {
    await lockSameVersion(ctx, tx, row);
    await assertNameFree(ctx, tx, row, entry.name);

    const saved = await save(
      tx,
      row,
      { name: entry.name, config: { ...entry.config, panels } },
      rest
    );

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "analytics:dashboard-undone",
      targetOf(row.id),
      "Undid the last change of a dashboard.",
      { version: saved.version }
    );

    return saved;
  });
}

export async function deleteDashboard(
  ctx: ModuleRequestContext,
  id: string
): Promise<void> {
  await withTransaction(ctx.tenant, async (tx) => {
    const [deleted] = await tx
      .delete(dashboard)
      .where(own(ctx, id))
      .returning({ id: dashboard.id });

    if (deleted === undefined) throw notFound();

    await audit(
      { tenant: ctx.tenant, caller: ctx.caller, tx },
      "analytics:dashboard-deleted",
      targetOf(deleted.id),
      "Deleted a dashboard."
    );
  });
}
