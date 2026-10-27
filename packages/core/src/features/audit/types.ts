import type {
  AuditActorView as AuditActor,
  AuditDateRange as DateRangePreset,
  AuditEventView as AuditEvent,
  AuditEventFilters as AuditFilters,
  AuditFilterOptions,
  AuditMetadataValue,
} from "../../services/audit/index.ts";

/**
 * The presentation types of the Audit log screen. The event, actor, filter and option views come
 * from the audit service through a type-only import, which the browser-safety guard skips. The
 * viewer, the empty filter state and the screen props are screen-only, because only the screen
 * renders them.
 */
export type {
  AuditActor,
  AuditEvent,
  AuditFilterOptions,
  AuditFilters,
  AuditMetadataValue,
  DateRangePreset,
};

/** The signed-in administrator reading the screen; only the time zone reaches the rendering. */
export type AuditViewer = {
  readonly id: string;
  readonly timeZone: string;
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
