/**
 * The presentation types of the Audit log screen. They mirror the approved design's
 * `docs/design/sections/audit-and-tenant-settings/types.ts`, because a browser-safe feature
 * folder may not import the design repository. The one addition is `operatorOnly`, the filter
 * R-68 requires and the design's sketch did not carry.
 *
 * These are the screen's inputs, not a server contract: the server view (`AuditEventView` in
 * `../../services/audit/reader.ts`) is structurally compatible, so a host maps one to the other
 * without re-deriving a target label or a link.
 */

export type DateRangePreset = "today" | "7d" | "30d" | "custom";

/** The signed-in administrator reading the screen; only the time zone reaches the rendering. */
export type AuditViewer = {
  readonly id: string;
  readonly timeZone: string;
};

export type AuditActor = {
  readonly id: string;
  readonly name: string;
  /** Empty for an anonymized (erased) person. */
  readonly email: string;
  /** True after personal-data erasure; the name is a placeholder. */
  readonly anonymized: boolean;
};

export type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly AuditMetadataValue[]
  | { readonly [name: string]: AuditMetadataValue };

/** One row of the reader, newest first. */
export type AuditEvent = {
  readonly id: string;
  /** ISO instant. */
  readonly occurredAt: string;
  /** Null for a system event (a job, provisioning, the operator CLI). */
  readonly actor: AuditActor | null;
  /** `module:verb` key, for example `core:person_added`. */
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  /** Resolved at read time; the stored id when the record no longer resolves. */
  readonly targetLabel: string;
  /** False when the target was removed since; the sheet shows Removed and no link. */
  readonly targetExists: boolean;
  /**
   * Where Open goes, supplied by the owning module's resolver and authorized for this reader, or
   * null. The screen never builds a route from the target type.
   */
  readonly targetPath: string | null;
  readonly summary: string;
  readonly metadata: Readonly<Record<string, AuditMetadataValue>>;
};

export type AuditFilterOptions = {
  readonly actors: readonly AuditActor[];
  /** The fixed R-45 catalogue; the screen groups it by the prefix before the first colon. */
  readonly actions: readonly string[];
  readonly targetTypes: readonly string[];
};

/** The five filters of R-67 plus the operator filter of R-68. */
export type AuditFilters = {
  readonly query: string;
  readonly actorId: string;
  readonly action: string;
  readonly targetType: string;
  readonly range: DateRangePreset;
  readonly from: string | null;
  readonly to: string | null;
  readonly operatorOnly: boolean;
};

/** The no-narrowing filter state: everything, and the default 30-day range. */
export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  query: "",
  actorId: "all",
  action: "all",
  targetType: "all",
  range: "30d",
  from: null,
  to: null,
  operatorOnly: false,
};

export type AuditLogProps = {
  readonly viewer: AuditViewer;
  readonly events: readonly AuditEvent[];
  /** The total the footer reads: Showing n of total. */
  readonly total: number;
  readonly filterOptions: AuditFilterOptions;
  readonly filters: AuditFilters;
  /** True while more events can load; the Load more control renders only then. */
  readonly hasMore: boolean;
  /** True while a page is loading. */
  readonly loading?: boolean;
  /**
   * True while a changed filter's first page loads and the rows shown are still the previous
   * filter's: the footer hides the old count and Load more, and a status names the reload.
   */
  readonly refreshing?: boolean;
  /** A deterministic clock for the relative times, so a story renders the same twice. */
  readonly nowIso?: string;
  /** The administrator changes a filter; the host reloads from the first page. */
  readonly onChangeAuditFilters?: (filters: AuditFilters) => void;
  /** The administrator loads the next page. */
  readonly onLoadMoreAuditEvents?: () => void;
  /** The administrator opens a target at the server-supplied path. */
  readonly onOpenAuditTarget?: (path: string) => void;
  /** The administrator copies an event id for a support ticket. */
  readonly onCopyEventId?: (eventId: string) => void;
};
