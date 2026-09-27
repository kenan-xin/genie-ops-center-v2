import type { AuditEvent, AuditFilterOptions, AuditViewer } from "../types.ts";

/**
 * Deterministic inputs for the Audit log stories. The clock is fixed, so a relative time renders
 * the same on every run, and every state the screen must cover has a row: a person, a system row,
 * an anonymized person, an openable target, an existing target with no path, and a removed one.
 */
export const FIXTURE_NOW = "2026-09-16T09:45:00.000Z";

export const FIXTURE_VIEWER: AuditViewer = {
  id: "viewer-1",
  timeZone: "UTC",
};

export const FIXTURE_FILTER_OPTIONS: AuditFilterOptions = {
  actors: [
    {
      id: "u-ada",
      name: "Ada Lovelace",
      email: "ada@example.invalid",
      anonymized: false,
    },
    {
      id: "u-removed",
      name: "Removed person",
      email: "",
      anonymized: true,
    },
  ],
  actions: [
    "auth:sign_in",
    "auth:sign_in_refused",
    "auth:sign_out",
    "core:person_added",
    "core:role_assignment_removed",
    "core:group_label_changed",
  ],
  targetTypes: ["person", "group", "fixture-record"],
};

export const FIXTURE_EVENTS: readonly AuditEvent[] = [
  {
    id: "ev-openable",
    occurredAt: "2026-09-16T09:40:00.000Z",
    actor: {
      id: "u-ada",
      name: "Ada Lovelace",
      email: "ada@example.invalid",
      anonymized: false,
    },
    action: "core:person_added",
    targetType: "person",
    targetId: "p-1",
    targetLabel: "Ada Lovelace",
    targetExists: true,
    targetPath: "/admin/people/p-1",
    summary: "Added Ada Lovelace and assigned Tenant administrator.",
    metadata: { role: "Tenant administrator" },
  },
  {
    id: "ev-no-link",
    occurredAt: "2026-09-16T09:30:00.000Z",
    actor: {
      id: "u-ada",
      name: "Ada Lovelace",
      email: "ada@example.invalid",
      anonymized: false,
    },
    action: "core:group_label_changed",
    targetType: "group",
    targetId: "g-1",
    targetLabel: "Finance reviewers",
    targetExists: true,
    targetPath: null,
    summary: "Renamed a group.",
    metadata: {},
  },
  {
    id: "ev-removed",
    occurredAt: "2026-09-16T09:00:00.000Z",
    actor: {
      id: "u-removed",
      name: "Removed person",
      email: "",
      anonymized: true,
    },
    action: "core:person_added",
    targetType: "person",
    targetId: "p-gone",
    targetLabel: "Removed person",
    targetExists: false,
    targetPath: null,
    summary: "A target that no longer exists.",
    metadata: { reason: "erased" },
  },
  {
    id: "ev-system",
    occurredAt: "2026-09-16T08:00:00.000Z",
    actor: null,
    action: "ops:migrate",
    targetType: "",
    targetId: "",
    targetLabel: "",
    targetExists: false,
    targetPath: null,
    summary: "ops:migrate",
    metadata: { osUser: "operator", outcome: "ok" },
  },
];
