import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { PermissionKey } from "../../lib/module-contract/keys.ts";
import { permissionKeyFor } from "../../lib/module-contract/keys.ts";
import type {
  Module,
  RecordTypeDeclaration,
} from "../../lib/module-contract/module.ts";
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
 * drop or repeat a row (R-67).
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

/** One row of the audit reader, ready for the screen. */
export type AuditEventView = {
  readonly id: string;
  /** ISO instant. */
  readonly occurredAt: string;
  readonly actor: AuditActorView | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  /** The resolver's label, or the stored id when the record no longer resolves. */
  readonly targetLabel: string;
  /** False when the owning module's resolver found no record for the target. */
  readonly targetExists: boolean;
  /**
   * The path the owning module's resolver returned, kept only when the viewer may open it under
   * `can()` (R-69). Null when the resolver returned no path, when the record is gone, or when the
   * viewer may not open it.
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
  /** Every row matching the filters, not only this page (the footer reads Showing n of total). */
  readonly total: number;
  /** Null when the page is the last one. */
  readonly nextCursor: AuditEventCursor | null;
  readonly filterOptions: AuditFilterOptions;
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
 * One SQL condition for the date range. Presets are measured on the server clock in UTC: `today`
 * is the current UTC day, and `7d`/`30d` are rolling windows. A custom range is whole days, so its
 * upper bound is exclusive of the next day.
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
    const like = `%${trimmed}%`;

    parts.push(
      sql`(${auditEvent.summary} ilike ${like} or ${auditEvent.targetId} ilike ${like})`
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

function recordTypeForType(
  module: AuditReadInput["modules"][number],
  type: string
): RecordTypeDeclaration | undefined {
  return module.recordTypes.find((recordType) => recordType.type === type);
}

/** A module's workspace key, the one that opens a record of its own (R-12, R-69). */
function useKeyOf(
  module: AuditReadInput["modules"][number]
): PermissionKey | undefined {
  const key = permissionKeyFor(module.identity.id, "use");

  return module.permissions.some((entry) => entry.key === key)
    ? key
    : undefined;
}

type ResolvedTarget = {
  readonly label: string;
  readonly exists: boolean;
  readonly path: string | null;
};

/**
 * Resolves the label and (when the viewer may open it) the path for each distinct target, once
 * per target. A target type no compiled module declares, or a record its resolver does not find,
 * has no path and reads as removed (R-69).
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

    const recordType =
      module === undefined ? undefined : recordTypeForType(module, target.type);

    if (module === undefined || recordType === undefined) {
      resolved.set(key, { label: target.id, exists: false, path: null });
      continue;
    }

    // The resolver reads through the request's own context (DEC-34).
    // oxlint-disable-next-line no-await-in-loop -- one target at a time; a batch resolver does not exist.
    const descriptor = await recordType.resolve(
      { tenant: input.tenant },
      target.id
    );

    const useKey = useKeyOf(module);
    const path = descriptor?.path ?? null;

    const openable =
      path !== null &&
      useKey !== undefined &&
      // oxlint-disable-next-line no-await-in-loop -- the check belongs to this target's resolver answer.
      (await can(input.caller, useKey, { type: target.type, id: target.id }));

    resolved.set(key, {
      label: descriptor?.label ?? target.id,
      exists: descriptor !== undefined,
      path: openable ? path : null,
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
    events,
    total: totalResult[0]?.total ?? 0,
    nextCursor:
      hasMore && last !== undefined
        ? { occurredAt: last.occurredAt.toISOString(), id: last.id }
        : null,
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
