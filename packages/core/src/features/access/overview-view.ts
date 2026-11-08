import type {
  AccessPath,
  AccessSubject,
} from "../../services/roles/effective-access.ts";
import type { GrantRecipients, GrantRow } from "../../services/roles/grants.ts";
import type { RoleRow } from "../../services/roles/index.ts";
import { scopeKey } from "./advanced-view.ts";
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
  readonly custom: boolean;
  readonly path: string;
  readonly alsoThrough: readonly string[];
  /** Reason sentences, in the order of the read. */
  readonly notInEffect: readonly string[];
  readonly addedAt: string;
  readonly addedBy: string | null;
};

const REASON = {
  "group-archived": () => "The group is archived",
  "person-disabled": () => "The person is disabled",
  "module-off": (module: string) => `The ${module} module is off`,
} as const;

/** A path reaches the module of `row`: its use key, or for a core role the same role (O4). */
const reachesSame = (row: AccessPath, other: AccessPath) =>
  row.role.moduleId === null
    ? other.role.id === row.role.id
    : other.role.permissions.includes(`${row.role.moduleId}:use`);

/**
 * "Also through" of a person's row (O4, R-37d): every other holder's live, whole-tenant path to the
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
    ? ["a direct assignment"]
    : [];

  const groups = others.flatMap((other) =>
    other.holder.type === "group" ? [other.holder.name] : []
  );

  return [...direct, ...new Set(groups)];
}

/**
 * The subject of a link into the Overview (`d8l5.46`): the role first, then the module, and only an
 * id that the lists hold, so an old bookmark reads nothing.
 */
export function linkedSubject(
  link: {
    readonly module?: string | undefined;
    readonly role?: string | undefined;
  },
  catalogue: readonly GrantRow[],
  roles: readonly Pick<RoleRow, "id">[]
): AccessSubject | null {
  if (link.role !== undefined && roles.some((role) => role.id === link.role)) {
    return { type: "role", id: link.role };
  }

  if (
    link.module !== undefined &&
    catalogue.some((row) => row.id === link.module)
  ) {
    return { type: "module", id: link.module };
  }

  return null;
}

/** The Overview rows of one page of the S2-19 read (R-37d, O4, O7, O16). */
export function overviewRows(input: {
  readonly subject: AccessSubject;
  /** The shown page. */
  readonly paths: readonly AccessPath[];
  /** Every path of a person subject (O4); undefined for a group or a module. */
  readonly personPaths: readonly AccessPath[] | undefined;
  readonly catalogue: readonly GrantRow[];
  readonly recipients: GrantRecipients;
  /** Record labels by `scopeKey`, only for records the caller can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
}): readonly OverviewRow[] {
  const { subject } = input;

  const subjectModule =
    subject.type === "module"
      ? (input.catalogue.find((row) => row.id === subject.id)?.name ??
        subject.id)
      : null;

  const pathOf = (path: AccessPath) => {
    // A module or a role is no holder: each row says how its holder holds it.
    if (subject.type === "module" || subject.type === "role") {
      if (path.holder.type === "user") return "Direct assignment";

      const members = input.recipients.groups.find(
        (group) => group.id === path.holder.id
      )?.memberCount;

      if (members === undefined) return "Group";

      return `Group, ${members} ${members === 1 ? "member" : "members"}`;
    }

    return path.holder.type === subject.type && path.holder.id === subject.id
      ? "Direct assignment"
      : `via ${path.holder.name}`;
  };

  return input.paths.map((path) => {
    const module = subjectModule ?? moduleNameOf(path, input.catalogue);

    return {
      key: path.assignmentId,
      holder: path.holder,
      module,
      record:
        path.scope === null
          ? null
          : (input.recordLabels.get(scopeKey(path.scope)) ?? path.scope.id),
      role: path.role.name,
      custom: path.role.kind === "custom",
      path: pathOf(path),
      alsoThrough:
        subject.type === "user"
          ? alsoThroughOf(path, input.personPaths ?? input.paths)
          : [],
      notInEffect: path.notInEffect.map((reason) => REASON[reason](module)),
      addedAt: path.addedAt,
      addedBy: path.addedBy?.name ?? null,
    };
  });
}
