import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import { permissionKeyFor } from "../../lib/module-contract/keys.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { auditEvent, user } from "../../schema.ts";
import { can, type RequestPrincipal } from "../authorization/index.ts";
import { AUDIT_ACTIONS } from "./actions.ts";

/**
 * One value an audit row's metadata may hold, after the boundary parse of its `jsonb` column. It is
 * the same closed shape the writer accepts (`AuditMetadataValue` in `./index.ts`), kept local so the
 * reader does not import the writer's module for a type.
 */
export type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly AuditMetadataValue[]
  | { readonly [name: string]: AuditMetadataValue };

/** A parsed `audit_event.metadata` object. Never a token, never an emailed link (R-44). */
export type AuditMetadata = Readonly<Record<string, AuditMetadataValue>>;

/** The date-range preset the reader offers (R-67). `custom` reads `from` and `to`. */
export type AuditDateRange = "today" | "7d" | "30d" | "custom";

/**
 * The five narrowing filters of R-67 plus the operator filter of R-68.
 *
 * `actorId` is `"all"`, `"system"` (a null actor), or a person id. `operatorOnly` is the one
 * filter that selects operator rows: a null actor and an `ops:`-prefixed action, both required.
 * `action` is `"all"` or one key of the R-45 catalogue. `targetType` is `"all"` or a stored
 * target type. `from` and `to` are `YYYY-MM-DD` and are read only by `custom`.
 *
 * Free text reads stored columns only: `summary`, `target_type` and `target_id` (R-67 as
 * amended). It never reads a resolved target label, which is a live record the viewer may not
 * open; an audit writer puts the target's name in the summary instead.
 */
export type AuditEventFilters = {
  readonly query: string;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly range: AuditDateRange;
  readonly from: string | null;
  readonly to: string | null;
  readonly operatorOnly: boolean;
};

/**
 * The keyset position of the next page: the `(occurred_at, id)` of the last row the reader
 * returned. The id breaks a tie when two events share one instant, so a page boundary can never
 * drop or repeat a row (R-67). The router validates both values before they reach here.
 */
export type AuditEventCursor = {
  readonly occurredAt: string;
  readonly id: string;
};

/** The actor of one event: a person, or null for a system or operator row. */
export type AuditActorView = {
  readonly id: string;
  readonly name: string;
  /** Empty after personal-data erasure; the row is shown anonymized. */
  readonly email: string;
  readonly anonymized: boolean;
};

/**
 * One row of the audit reader, ready for the screen.
 *
 * The target fields carry no live record data unless the viewer may open the record
 * (R-69): a resolver's label and existence are gated behind `can()` on the record, so a target the
 * viewer may not open leaves only the stored `targetType` and `targetId`, exactly as a removed
 * target does. `targetLabel` is empty and `targetExists` false in both cases.
 */
export type AuditEventView = {
  readonly id: string;
  /** ISO instant. */
  readonly occurredAt: string;
  readonly actor: AuditActorView | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  /** The resolver's label when the viewer may open the record; empty otherwise. */
  readonly targetLabel: string;
  /** True only for a record that resolves and the viewer may open; false for a missing or denied one. */
  readonly targetExists: boolean;
  /**
   * The path the owning module's resolver returned, kept only when the viewer may open it under
   * `can()` on the path's own permission (R-69). Null when the resolver returned no path, when the
   * record is gone, or when the viewer may not open it.
   */
  readonly targetPath: string | null;
  readonly summary: string;
  readonly metadata: AuditMetadata;
};

/** The fixed action list (grouped by prefix) plus the actors and target types this tenant holds. */
export type AuditFilterOptions = {
  readonly actors: readonly AuditActorView[];
  /** The R-45 catalogue, so an action stays filterable even after its last row is gone. */
  readonly actions: readonly string[];
  readonly targetTypes: readonly string[];
};

/** One page of the reader, newest first. */
export type AuditPage = {
  readonly events: readonly AuditEventView[];
  /**
   * Every row matching the filters, not only this page. Null off the first page: the exact count
   * is a full-history scan, so the router asks for it only when the cursor is null (R-67).
   */
  readonly total: number | null;
  /** Null when the page is the last one. */
  readonly nextCursor: AuditEventCursor | null;
  /** The filter lists, only on the first page, for the same reason as `total`. */
  readonly filterOptions: AuditFilterOptions | null;
};

/** Everything one read needs: the context, the request principal, and the compiled record types. */
export type AuditReadInput = {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  /** The compiled modules that declare record types, read through the request's own context. */
  readonly modules: readonly Pick<
    Module,
    "identity" | "permissions" | "recordTypes"
  >[];
  readonly filters: AuditEventFilters;
  readonly cursor: AuditEventCursor | null;
  /** The page size, already bounded by the caller. */
  readonly limit: number;
  /**
   * Whether to compute the exact total and the filter option lists. True only for the first page:
   * a tenant-lifetime append-only log makes those two aggregates a full-history scan.
   */
  readonly includeFacets: boolean;
};

/* oxlint-disable anti-slop/no-runtime-typeof -- the boundary parse of a jsonb column: these typeof probes turn `unknown` metadata into the closed shape below. */

/**
 * Parses one value of the `jsonb` column into the closed metadata shape. The parameter is named
 * `cause` because `anti-slop/no-unknown-parameters` admits exactly that name for an unparsed input.
 */
function metadataValue(cause: unknown): AuditMetadataValue {
  if (
    cause === null ||
    typeof cause === "string" ||
    typeof cause === "number" ||
    typeof cause === "boolean"
  ) {
    return cause;
  }

  if (Array.isArray(cause)) return cause.map(metadataValue);

  if (typeof cause === "object") {
    const parsed: Record<string, AuditMetadataValue> = {};

    for (const [key, entry] of Object.entries(cause)) {
      parsed[key] = metadataValue(entry);
    }

    return parsed;
  }

  return null;
}

/** Parses the `jsonb` column into the closed metadata shape; anything unreadable reads empty. */
function parseMetadata(cause: unknown) {
  if (cause === null || typeof cause !== "object" || Array.isArray(cause)) {
    return {};
  }

  const parsed: Record<string, AuditMetadataValue> = {};

  for (const [key, entry] of Object.entries(cause)) {
    parsed[key] = metadataValue(entry);
  }

  return parsed;
}

/* oxlint-enable anti-slop/no-runtime-typeof */

/**
 * One `ILIKE` pattern for a literal search term. `%`, `_` and the backslash are escaped and the
 * pattern is used with `ESCAPE '\'`, so a search for `_` or `%` matches those characters literally
 * rather than turning into a wildcard (R-67).
 */
function likePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);

  return `%${escaped}%`;
}

/**
 * One SQL condition for the date range. Presets are measured on the server clock in UTC: `today`
 * is the current UTC day, and `7d`/`30d` are rolling windows. A custom range is whole days, so its
 * upper bound is exclusive of the next day. The router validates a custom `from`/`to` as dates.
 */
function rangeCondition(filters: AuditEventFilters): SQL | undefined {
  if (filters.range === "today") {
    return sql`${auditEvent.occurredAt} >= date_trunc('day', now())`;
  }

  if (filters.range === "7d") {
    return sql`${auditEvent.occurredAt} >= now() - interval '7 days'`;
  }

  if (filters.range === "30d") {
    return sql`${auditEvent.occurredAt} >= now() - interval '30 days'`;
  }

  const parts: SQL[] = [];

  if (filters.from !== null) {
    parts.push(sql`${auditEvent.occurredAt} >= ${filters.from}::date`);
  }

  if (filters.to !== null) {
    parts.push(
      sql`${auditEvent.occurredAt} < (${filters.to}::date + interval '1 day')`
    );
  }

  return and(...parts);
}

/** The filter conditions of one read, without the keyset position. */
function filterCondition(filters: AuditEventFilters): SQL | undefined {
  const parts: SQL[] = [];
  const trimmed = filters.query.trim();

  if (trimmed !== "") {
    // Stored columns only: summary, target type, target id (R-67 as amended).
    const like = likePattern(trimmed);

    parts.push(
      sql`(${auditEvent.summary} ilike ${like} escape '\\' or ${auditEvent.targetType} ilike ${like} escape '\\' or ${auditEvent.targetId} ilike ${like} escape '\\')`
    );
  }

  if (filters.operatorOnly) {
    // R-68: both halves, because a person could hold an `ops:`-prefixed key.
    parts.push(
      sql`(${auditEvent.actorUserId} is null and ${auditEvent.action} like 'ops:%')`
    );
  } else if (filters.actorId === "system") {
    parts.push(isNull(auditEvent.actorUserId));
  } else if (filters.actorId !== "all") {
    parts.push(eq(auditEvent.actorUserId, filters.actorId));
  }

  if (filters.action !== "all") {
    parts.push(eq(auditEvent.action, filters.action));
  }

  if (filters.targetType !== "all") {
    parts.push(eq(auditEvent.targetType, filters.targetType));
  }

  const range = rangeCondition(filters);

  if (range !== undefined) parts.push(range);

  return and(...parts);
}

/** The keyset condition: strictly after the last returned row in `(occurred_at, id)` order. */
function cursorCondition(cursor: AuditEventCursor): SQL {
  return sql`(${auditEvent.occurredAt}, ${auditEvent.id}) < (${cursor.occurredAt}::timestamptz, ${cursor.id}::uuid)`;
}

/** The module that declares one record type, or undefined when none does. */
function moduleForRecordType(
  modules: AuditReadInput["modules"],
  type: string
): AuditReadInput["modules"][number] | undefined {
  return modules.find((module) =>
    module.recordTypes.some((recordType) => recordType.type === type)
  );
}

/** A target the viewer may not open: no live label, no existence flag, no path (R-69). */
const HIDDEN_TARGET: ResolvedTarget = { label: "", exists: false, path: null };

type ResolvedTarget = {
  readonly label: string;
  readonly exists: boolean;
  readonly path: string | null;
};

/**
 * Resolves each distinct target once, through the principal's own record resolver, and keeps the
 * live label, existence and path only when the viewer may open the record under `can()` on the
 * path's declared permission (defaulting to the owning module's `<id>:use`). A target the viewer
 * may not open is returned exactly like a target that no longer resolves: only the stored type and
 * id remain, so an auditor entitled to the event but not the record learns nothing live (R-69).
 *
 * The resolution goes through `caller.recordOf`, the same memo `can()` reads for parents, so the
 * owning module's resolver runs at most once for one target per request.
 */
async function resolveTargets(
  input: AuditReadInput,
  targets: readonly { readonly type: string; readonly id: string }[]
): Promise<Map<string, ResolvedTarget>> {
  const resolved = new Map<string, ResolvedTarget>();

  for (const target of targets) {
    const key = `${target.type}\u0000${target.id}`;

    if (resolved.has(key)) continue;

    const module = moduleForRecordType(input.modules, target.type);

    if (module === undefined) {
      resolved.set(key, HIDDEN_TARGET);
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- one target at a time; the principal memoises each.
    const descriptor = await input.caller.recordOf({
      type: target.type,
      id: target.id,
    });

    if (descriptor === undefined) {
      resolved.set(key, HIDDEN_TARGET);
      continue;
    }

    const permission =
      descriptor.permission ?? permissionKeyFor(module.identity.id, "use");

    // oxlint-disable-next-line no-await-in-loop -- the check belongs to this target's resolution.
    const allowed = await can(input.caller, permission, {
      type: target.type,
      id: target.id,
    });

    if (!allowed) {
      resolved.set(key, HIDDEN_TARGET);
      continue;
    }

    resolved.set(key, {
      label: descriptor.label,
      exists: true,
      path: descriptor.path ?? null,
    });
  }

  return resolved;
}

function toActorView(row: {
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly actorEmail: string | null;
  readonly actorErasedAt: Date | null;
}): AuditActorView | null {
  if (row.actorId === null) return null;

  return {
    id: row.actorId,
    name: row.actorName ?? "",
    email: row.actorErasedAt === null ? (row.actorEmail ?? "") : "",
    anonymized: row.actorErasedAt !== null,
  };
}

/**
 * The audit reader (R-67 to R-69). It refuses a caller without `core:audit:read` through the one
 * seam (DEC-39), pages newest first by keyset on `(occurred_at, id)`, and links a target only when
 * its owning module's resolver returned a path the viewer may open.
 */
export async function readAuditPage(input: AuditReadInput): Promise<AuditPage> {
  if (!(await can(input.caller, "core:audit:read"))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  const filtered = filterCondition(input.filters);

  const where =
    input.cursor === null
      ? filtered
      : and(filtered, cursorCondition(input.cursor));

  const rows = await input.tenant.db
    .select({
      id: auditEvent.id,
      occurredAt: auditEvent.occurredAt,
      actorId: auditEvent.actorUserId,
      action: auditEvent.action,
      targetType: auditEvent.targetType,
      targetId: auditEvent.targetId,
      summary: auditEvent.summary,
      metadata: auditEvent.metadata,
      actorName: user.name,
      actorEmail: user.email,
      actorErasedAt: user.erasedAt,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(where)
    .orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
    // One extra row answers whether a next page exists without a second round trip.
    .limit(input.limit + 1);

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const last = page.at(-1);

  const targets = page.flatMap((row) =>
    row.targetType === null || row.targetId === null
      ? []
      : [{ type: row.targetType, id: row.targetId }]
  );

  const resolved = await resolveTargets(input, targets);

  const events: AuditEventView[] = page.map((row) => {
    const target =
      row.targetType === null || row.targetId === null
        ? undefined
        : resolved.get(`${row.targetType}\u0000${row.targetId}`);

    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actor: toActorView(row),
      action: row.action,
      targetType: row.targetType ?? "",
      targetId: row.targetId ?? "",
      targetLabel: target?.label ?? "",
      targetExists: target?.exists ?? false,
      targetPath: target?.path ?? null,
      summary: row.summary,
      metadata: parseMetadata(row.metadata),
    };
  });

  const facets = input.includeFacets ? await readFacets(input, filtered) : null;

  return {
    events,
    total: facets?.total ?? null,
    nextCursor:
      hasMore && last !== undefined
        ? { occurredAt: last.occurredAt.toISOString(), id: last.id }
        : null,
    filterOptions: facets?.filterOptions ?? null,
  };
}

/** The exact total and the filter lists, computed only on the first page (R-67). */
async function readFacets(
  input: AuditReadInput,
  filtered: SQL | undefined
): Promise<{
  readonly total: number;
  readonly filterOptions: AuditFilterOptions;
}> {
  const totalResult = await input.tenant.db
    .select({ total: sql<number>`count(*)::int` })
    .from(auditEvent)
    .where(filtered);

  const actorRows = await input.tenant.db
    .selectDistinct({
      id: user.id,
      name: user.name,
      email: user.email,
      erasedAt: user.erasedAt,
    })
    .from(auditEvent)
    .innerJoin(user, eq(user.id, auditEvent.actorUserId))
    .orderBy(user.name);

  const targetRows = await input.tenant.db
    .selectDistinct({ targetType: auditEvent.targetType })
    .from(auditEvent)
    .orderBy(auditEvent.targetType);

  return {
    total: totalResult[0]?.total ?? 0,
    filterOptions: {
      actors: actorRows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.erasedAt === null ? row.email : "",
        anonymized: row.erasedAt !== null,
      })),
      actions: [...AUDIT_ACTIONS],
      targetTypes: targetRows
        .map((row) => row.targetType)
        .filter((type): type is string => type !== null),
    },
  };
}
