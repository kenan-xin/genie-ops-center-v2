import type { AuditFilters } from "./types.ts";

/** The one focus ring (design tokens): a 2px offset ring on every interactive element. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-background";

export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-lg border border-input bg-white px-3 text-sm font-semibold text-foreground motion-safe:transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white text-foreground dark:hover:bg-foreground dark:disabled:hover:bg-gray-950 ${focusRing}`;

export const btnGhost = `inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground motion-safe:transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent sm:h-8 text-foreground dark:hover:bg-foreground ${focusRing}`;

export const inputClass = `h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground dark:border-input text-foreground ${focusRing}`;

/** The label inside the filter panel; caption size, because the panel carries its own title. */
export const filterLabel = "text-xs font-semibold text-foreground";

export const RANGE_LABEL = {
  "today": "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "custom": "Custom range",
} as const;

/** The render order of the range select; typed so no assertion is needed at the call site. */
export const RANGE_ORDER: readonly (keyof typeof RANGE_LABEL)[] = [
  "today",
  "7d",
  "30d",
  "custom",
];

export function fmtDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}

export function fmtDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** The exact instant with seconds and the zone, for the detail sheet and the row's title. */
export function fmtExact(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
    timeZone,
  });
}

export function relativeTime(iso: string, now: Date, timeZone: string): string {
  const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);

  if (days < 30) return `${days} d ago`;

  // Older than 30 days: a calendar date in the viewer's own zone, not UTC.
  return fmtDate(iso, timeZone);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** `role_assignment` to `Role assignment`. */
export function humanize(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The module prefix of an action key: `solutions:status:changed` to `solutions`. */
export function actionGroup(action: string): string {
  const [group] = action.split(":");

  return group ?? action;
}

/** True when a metadata value reads like an id or a key and belongs in mono. */
export function looksLikeCode(value: AuditMetadataDisplay): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a display-time heuristic, not a parse
  if (typeof value !== "string") return false;

  return (
    /^[a-z]+_[a-z0-9_-]+$/i.test(value) ||
    /^[a-z-]+:[a-z:-]+$/i.test(value) ||
    /^#[0-9a-f]{6}$/i.test(value)
  );
}

type AuditMetadataDisplay =
  | string
  | number
  | boolean
  | null
  | readonly AuditMetadataDisplay[]
  | { readonly [name: string]: AuditMetadataDisplay };

export function formatMetaValue(value: AuditMetadataDisplay): string {
  if (value === null) return "—";

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a display-time format, not a parse
  if (typeof value === "boolean") return value ? "Yes" : "No";

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a display-time format, not a parse
  if (typeof value === "number") return value.toLocaleString("en-GB");

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a display-time format, not a parse
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    return value.length === 0
      ? "—"
      : value.map((entry) => formatMetaValue(entry)).join(", ");
  }

  return JSON.stringify(value);
}

/** The number of narrowing filters beyond the free text (the button's count badge). */
export function countActiveFilters(filters: AuditFilters): number {
  let count = 0;

  if (filters.actorId !== "all") count += 1;

  if (filters.action !== "all") count += 1;

  if (filters.targetType !== "all") count += 1;

  if (filters.range !== "30d") count += 1;

  if (filters.operatorOnly) count += 1;

  return count;
}
