import type {
  AccessPath,
  AccessRecipient,
} from "../../services/roles/effective-access.ts";
import type { GrantChanges, GrantRow } from "../../services/roles/grants.ts";
import { EMPTY_DRAFT, type GrantsDraft } from "./grants-draft-store.ts";

export type GrantedRowView = {
  readonly row: GrantRow;
  readonly shown: AccessPath;
};

export type CatalogRowView = {
  readonly row: GrantRow;
  readonly alsoThrough: readonly string[];
};

export type GrantsView = {
  readonly granted: readonly GrantedRowView[];
  readonly catalog: readonly CatalogRowView[];
  readonly notShown: readonly AccessPath[];
};

export type Removal = {
  readonly rolesThatGo: readonly AccessPath[];
  readonly pathsThatStay: readonly AccessPath[];
};

const isDirect = (path: AccessPath, recipient: AccessRecipient) =>
  path.holder.type === recipient.type && path.holder.id === recipient.id;

const ownsRole = (row: GrantRow, roleId: string) =>
  row.roles.some((role) => role.id === roleId);

/** A path that opens the row (P6): its role carries the use key and its group is not archived. */
const opens = (row: GrantRow, path: AccessPath) =>
  path.role.permissions.includes(row.useKey) &&
  !path.notInEffect.includes("group-archived");

/**
 * Splits the catalogue for one recipient (P4, P6). A row is Granted when the recipient holds one
 * of its roles directly at whole-tenant scope, and shows the first such role in choice order. Every
 * other direct assignment is "Not shown here", so nothing the recipient holds is hidden.
 */
export function grantsView(input: {
  readonly catalogue: readonly GrantRow[];
  readonly paths: readonly AccessPath[];
  readonly recipient: AccessRecipient;
}): GrantsView {
  const direct = input.paths.filter((path) => isDirect(path, input.recipient));

  const granted: GrantedRowView[] = [];

  const catalog: CatalogRowView[] = [];

  for (const row of input.catalogue) {
    const shown = row.roles
      .map((role) =>
        direct.find((path) => path.scope === null && path.role.id === role.id)
      )
      .find((path) => path !== undefined);

    if (shown !== undefined) {
      granted.push({ row, shown });
      continue;
    }

    const alsoThrough =
      input.recipient.type === "user"
        ? input.paths
            .filter(
              (path) =>
                path.holder.type === "group" &&
                path.scope === null &&
                opens(row, path)
            )
            .map((path) => path.holder.name)
        : [];

    catalog.push({ row, alsoThrough: [...new Set(alsoThrough)] });
  }

  const shownIds = new Set(granted.map((view) => view.shown.assignmentId));

  return {
    granted,
    catalog,
    notShown: direct.filter((path) => !shownIds.has(path.assignmentId)),
  };
}

/**
 * What a Remove of the row takes and what keeps the module (P5, P6): every direct role of the row
 * at any scope goes, and every other live path that carries the use key stays.
 */
export function removalOf(
  row: GrantRow,
  paths: readonly AccessPath[],
  recipient: AccessRecipient
): Removal {
  const goes = (path: AccessPath) =>
    isDirect(path, recipient) && ownsRole(row, path.role.id);

  return {
    rolesThatGo: paths.filter(goes),
    pathsThatStay: paths.filter((path) => !goes(path) && opens(row, path)),
  };
}

/** The save payload (P7, P8). A change names the shown assignment that the role replaces. */
export function saveInput(view: GrantsView, draft: GrantsDraft): GrantChanges {
  return {
    add: Object.entries(draft.add).map(([row, roleId]) => ({ row, roleId })),
    change: Object.entries(draft.change).flatMap(([row, roleId]) => {
      const shown = view.granted.find((granted) => granted.row.id === row);

      // A row that a reload moved to Catalog has no assignment to replace.
      return shown === undefined
        ? []
        : [{ row, assignmentId: shown.shown.assignmentId, roleId }];
    }),
    remove: draft.remove.map((row) => ({ row })),
  };
}

/**
 * The draft that a prefilled link stages on the first recipient (P17). `?role=` wins over
 * `?module=`. A role of no row, or a switched-off row, stages nothing.
 */
export function linkDraft(
  view: GrantsView,
  link: {
    readonly module?: string | undefined;
    readonly role?: string | undefined;
  }
): GrantsDraft {
  const rows = [...view.granted, ...view.catalog].map((entry) => entry.row);

  const { role } = link;

  const row =
    role === undefined
      ? rows.find((candidate) => candidate.id === link.module)
      : rows.find((candidate) => ownsRole(candidate, role));

  const roleId = role ?? row?.defaultRoleId ?? undefined;

  if (row === undefined || !row.enabled || roleId === undefined) {
    return EMPTY_DRAFT;
  }

  const shown = view.granted.find((granted) => granted.row.id === row.id);

  if (shown === undefined) return { ...EMPTY_DRAFT, add: { [row.id]: roleId } };

  return role === undefined || shown.shown.role.id === role
    ? EMPTY_DRAFT
    : { ...EMPTY_DRAFT, change: { [row.id]: role } };
}
