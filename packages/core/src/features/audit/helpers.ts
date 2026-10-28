import type { CategoryTone } from "@genie/ui";
import { capitalize, lowerCase } from "es-toolkit";

import type { AuditFilters } from "./types.ts";

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

/**
 * The event category of an action key, for the category chip (`DESIGN.md`, State-vs-Label Rule
 * exception). The first prefix names the domain; a prefix core does not own is a module's own
 * event, and an operator row carries no category, so it keeps the neutral chip.
 */
export function eventCategory(action: string): CategoryTone | null {
  const [prefix = "", verb = ""] = action.split(":");

  if (prefix === "ops") return null;

  if (prefix === "auth") return "session";

  if (prefix !== "core") return "module-event";

  if (
    verb.startsWith("person") ||
    verb === "invitation_sent" ||
    verb === "set_password_sent"
  ) {
    return "people";
  }

  if (verb.includes("group")) return "groups";

  if (verb.startsWith("role") || verb === "permission_transformation") {
    return "access";
  }

  if (verb === "branding_published" || verb === "settings_updated") {
    return "settings";
  }

  return "modules";
}

/** `role_assignment` to `Role assignment`. */
export function humanize(key: string): string {
  return capitalize(lowerCase(key));
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
