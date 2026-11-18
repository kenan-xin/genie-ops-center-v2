import type { ListDefinition } from "@genie/ui";

import type {
  AccessHolder,
  AccessPath,
  AccessRecipient,
  AccessSubject,
  AssignmentFilters,
  NotInEffect,
} from "../../services/roles/effective-access.ts";
import type { GrantRow } from "../../services/roles/grants.ts";
import type { RoleRow } from "../../services/roles/index.ts";
import type { RecipientRow } from "../../services/roles/recipients.ts";
import { scopeKey } from "./advanced-view.ts";
import { holderLine } from "./assignment-words.ts";
import { moduleNameOf } from "./grants-view.ts";

/** One row of the Overview table (R-37d). */
export type OverviewRow = {
  /** `assignmentId`. */
  readonly key: string;
  /** The Who column: the person or the group that holds the assignment. */
  readonly holder: AccessPath["holder"];
  readonly module: string;
  /** The record's label of a one-record role, else its `scope.id`; null for the whole tenant. */
  readonly record: string | null;
  readonly role: string;
  /** The role's id, for a link to Roles. */
  readonly roleId: string;
  readonly custom: boolean;
  /** The Assigned to line: "Person", "Group · 6 members" or "Directory group · 17 members". */
  readonly kind: string;
  readonly path: string;
  readonly alsoThrough: readonly string[];
  /** Reason sentences, in the order of the read. */
  readonly notInEffect: readonly string[];
  readonly addedAt: string;
  readonly addedBy: string | null;
  readonly addedAtSetup: boolean;
};

const REASON = {
  "group-archived": () => "Group archived",
  "person-disabled": () => "Person suspended",
  "module-off": () => "Module off",
} as const;

/** The words of one reason an assignment grants nothing now: "Module off" (G9). */
export const reasonLabel = (reason: NotInEffect): string => REASON[reason]();

/** One pill per reason of an assignment that grants nothing now: "Paused: Module off" (G9). */
export const pausedLabel = (reason: string) => `Paused: ${reason}`;

/** A path reaches the module of `row`: its use key, or for a core role the same role (O4). */
const reachesSame = (row: AccessPath, other: AccessPath) =>
  row.role.moduleId === null
    ? other.role.id === row.role.id
    : other.role.permissions.includes(`${row.role.moduleId}:use`);

/**
 * "Also assigned via" of a person's row (O4, R-37d): every other holder's live, whole-tenant path to the
 * same module, read from every path of the person, so a path on another page still counts. A
 * direct assignment comes first, then the group names in read order.
 */
function alsoThroughOf(
  row: AccessPath,
  candidates: readonly AccessPath[]
): readonly string[] {
  const others = candidates.filter(
    (other) =>
      other.assignmentId !== row.assignmentId &&
      (other.holder.type !== row.holder.type ||
        other.holder.id !== row.holder.id) &&
      other.scope === null &&
      other.notInEffect.length === 0 &&
      reachesSame(row, other)
  );

  const direct = others.some((other) => other.holder.type === "user")
    ? ["Direct"]
    : [];

  const groups = others.flatMap((other) =>
    other.holder.type === "group" ? [other.holder.name] : []
  );

  return [...direct, ...new Set(groups)];
}

/** The Overview rows of one page (R-37d, O4, O7, O16, d8l5.62). */
export function overviewRows(input: {
  /** The Person or group filter, a module or a role; null for the unfiltered list. */
  readonly subject: AccessSubject | null;
  /** The shown page. */
  readonly paths: readonly AccessPath[];
  /** Every path of a person subject (O4); undefined otherwise. */
  readonly personPaths: readonly AccessPath[] | undefined;
  readonly catalogue: readonly GrantRow[];
  /** `AccessPage.memberCounts`: the size of each group on the page (d8l5.74 item 3). */
  readonly memberCounts: Readonly<Record<string, number>>;
  /** Record labels by `scopeKey`, only for records the caller can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
}): readonly OverviewRow[] {
  const { subject } = input;

  const subjectModule =
    subject?.type === "module"
      ? (input.catalogue.find((row) => row.id === subject.id)?.name ??
        subject.id)
      : null;

  const kindOf = (holder: AccessHolder) =>
    holder.type === "user" ? "Person" : holderLine(holder, input.memberCounts);

  const pathOf = (path: AccessPath) => {
    // No recipient filter: each row says how its holder holds the role.
    if (
      subject === null ||
      subject.type === "module" ||
      subject.type === "role"
    ) {
      return path.holder.type === "user" ? "Direct" : kindOf(path.holder);
    }

    // The Assigned via column (G10): "Direct" or the group's name.
    return path.holder.type === subject.type && path.holder.id === subject.id
      ? "Direct"
      : path.holder.name;
  };

  return input.paths.map((path) => ({
    key: path.assignmentId,
    holder: path.holder,
    module: subjectModule ?? moduleNameOf(path, input.catalogue),
    record:
      path.scope === null
        ? null
        : (input.recordLabels.get(scopeKey(path.scope)) ?? path.scope.id),
    role: path.role.name,
    roleId: path.role.id,
    custom: path.role.kind === "custom",
    kind: kindOf(path.holder),
    path: pathOf(path),
    alsoThrough:
      subject?.type === "user"
        ? alsoThroughOf(path, input.personPaths ?? input.paths)
        : [],
    notInEffect: path.notInEffect.map((reason) => REASON[reason]()),
    addedAt: path.addedAt,
    addedBy: path.addedBy?.name ?? null,
    addedAtSetup: path.addedAtSetup,
  }));
}

/** `user:<id>` or `group:<id>` from the address; anything else is null (P12-8). */
export function parseWho(value: string | undefined): AccessRecipient | null {
  const [type, ...rest] = (value ?? "").split(":");
  const id = rest.join(":");

  return (type === "user" || type === "group") && id !== ""
    ? { type, id }
    : null;
}

/** The address value of a person or a group (P12-8). */
export const whoParam = (recipient: AccessRecipient) =>
  `${recipient.type}:${recipient.id}`;

const NAMES = new Intl.ListFormat("en-GB", { type: "conjunction" });

/**
 * "Riley Chen has 6 roles: 2 direct, 4 via Finance team." from every path of the person: a role
 * held directly and through a group counts twice, as the list shows two rows (Review Focus 4).
 */
export function reachLine(name: string, paths: readonly AccessPath[]): string {
  if (paths.length === 0) return `${name} has no roles.`;

  const direct = paths.filter((path) => path.holder.type === "user").length;
  const groups = new Map<string, { readonly name: string; count: number }>();

  for (const path of paths) {
    if (path.holder.type !== "group") continue;

    const group = groups.get(path.holder.id) ?? {
      name: path.holder.name,
      count: 0,
    };

    group.count += 1;
    groups.set(path.holder.id, group);
  }

  const via = NAMES.format(
    [...groups.values()].map((group) => `${group.count} via ${group.name}`)
  );

  const parts = [direct === 0 ? "" : `${direct} direct`, via].filter(
    (part) => part !== ""
  );

  return `${name} has ${paths.length} ${paths.length === 1 ? "role" : "roles"}: ${parts.join(", ")}.`;
}

/**
 * The input of `roles.assignments` from the address (P12-8). `ready` is false while a set `who`
 * is looked up. A `who` with no row, a `module` that the catalogue does not hold and a `role` that
 * the roles list does not hold are left out, because `readAssignments` answers `not-found` for an
 * unknown person (Task 1).
 */
export type ReadFilters = {
  readonly ready: boolean;
  readonly filters: AssignmentFilters;
  readonly query: string;
};

/** The filters while `readFilters` builds them: each key is added only when a list holds it. */
type MutableFilters = {
  recipient?: AccessRecipient;
  moduleId?: string;
  roleId?: string;
};

export function readFilters(input: {
  readonly params: Readonly<Record<string, string>>;
  /** The `who` lookup: undefined while it loads, null when it found no row. */
  readonly who: RecipientRow | null | undefined;
  readonly catalogue: readonly GrantRow[];
  readonly roles: readonly Pick<RoleRow, "id">[];
}): ReadFilters {
  const { params, who } = input;
  const asked = parseWho(params["who"]);
  const moduleId = params["module"];
  const roleId = params["role"];

  const found =
    asked !== null &&
    who !== undefined &&
    who !== null &&
    who.type === asked.type &&
    who.id === asked.id;

  const filters: MutableFilters = {};

  if (found && asked !== null) filters.recipient = asked;

  if (
    moduleId !== undefined &&
    input.catalogue.some((row) => row.id === moduleId)
  ) {
    filters.moduleId = moduleId;
  }

  if (roleId !== undefined && input.roles.some((role) => role.id === roleId)) {
    filters.roleId = roleId;
  }

  return {
    ready: asked === null || who !== undefined,
    query: params["q"] ?? "",
    filters,
  };
}

/**
 * The Overview list (P12-8, P12-12): the search, then Person or group, Module and Role, each 200 px
 * in the bar so all four sit in the bar at 1440. Role lists Core first, then each module in
 * catalogue order, each by name. One order, newest first, with no sort control (P12-19).
 */
export function overviewDefinition(
  catalogue: readonly GrantRow[],
  roles: readonly Pick<RoleRow, "id" | "name" | "moduleId">[]
): ListDefinition {
  const rank = (moduleId: string | null) => {
    if (moduleId === null) return -1;

    const at = catalogue.findIndex((row) => row.id === moduleId);

    return at === -1 ? catalogue.length : at;
  };

  return {
    label: "Assignments, newest first",
    noun: ["assignment", "assignments"],
    filters: [
      {
        id: "q",
        kind: "search",
        label: "Search by role or name",
        placeholder: "Search by role or name",
      },
      {
        id: "who",
        kind: "access-recipient",
        label: "Person or group",
        placeholder: "Anyone",
        barWidth: 200,
      },
      {
        id: "module",
        kind: "option",
        label: "Module",
        placeholder: "All modules",
        options: catalogue.map((row) => ({ value: row.id, label: row.name })),
        barWidth: 200,
      },
      {
        id: "role",
        kind: "option",
        label: "Role",
        placeholder: "All roles",
        options: roles
          .toSorted(
            (a, b) =>
              rank(a.moduleId) - rank(b.moduleId) ||
              a.name.localeCompare(b.name)
          )
          .map((role) => ({ value: role.id, label: role.name })),
        barWidth: 200,
      },
    ],
    sorts: [],
    defaultSort: { column: "added", direction: "desc" },
  };
}
