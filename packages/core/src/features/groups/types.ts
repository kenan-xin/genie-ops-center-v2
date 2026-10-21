/**
 * The presentation types of the Groups screen. A browser-safe feature folder may not import the
 * design repository, so these mirror `docs/design/sections/people-groups-and-roles/types.ts` for
 * the group part, and are structurally compatible with the core service's read rows, so a host
 * maps one to the other without re-deriving a label.
 */

export type GroupSource = "idp" | "local";

export type Group = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: GroupSource;
  /** R-24b: the exact claim value, present for a directory group. */
  readonly externalId: string | null;
  /** R-24c: shown in place of the value in lists and Access; the value stays in the inspector. */
  readonly displayLabel: string | null;
  readonly memberCount: number;
  readonly assignmentCount: number;
  /** R-24b: null until a sign-in lists the group ("Not seen yet"). */
  readonly lastSeenAt: string | null;
  readonly archived: boolean;
  /** R-24a: computed on read, never stored. */
  readonly stale: boolean;
};

export type GroupMember = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly source: GroupSource;
  readonly syncedAt: string | null;
};

export type GroupAssignment = {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
};

/** One person a local group's member picker can offer. */
export type PersonOption = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
};

/** One role the inspector can assign to a group. */
export type AssignableRole = {
  readonly id: string;
  readonly name: string;
  readonly moduleId: string | null;
};

export type GroupsViewer = {
  readonly id: string;
  readonly timeZone: string;
};

/** The label a group shows: the display label when set, the name otherwise (R-24c). */
export function groupLabel(group: Group): string {
  return group.displayLabel ?? group.name;
}

/**
 * True when the group is the last active path to a tenant administrator, so Archive, Delete and
 * Remove members are blocked with the reason (R-38). The host computes it from the assignment
 * data; the screen only mirrors the server's refusal.
 */
export type GroupsScreenProps = {
  readonly groups: readonly Group[];
  readonly viewer: GroupsViewer;
  readonly includeArchived: boolean;
  readonly onChangeIncludeArchived: (includeArchived: boolean) => void;
  /** Fires when a row opens or the inspector closes, so the host can load that group's detail. */
  readonly onSelectGroup?: (groupId: string | null) => void;
  readonly people: readonly PersonOption[];
  /** The roles the inspector can assign to a group (R-24b). */
  readonly roles?: readonly AssignableRole[] | undefined;
  /** Per-group members and assignments for the inspector, loaded by the host on selection. */
  readonly details?: Readonly<
    Record<
      string,
      {
        readonly members: readonly GroupMember[];
        readonly assignments: readonly GroupAssignment[];
      }
    >
  >;
  /** R-38: group ids where archiving or removing a member would leave no administrator. */
  readonly lastAdministratorGroupIds: readonly string[];
  /** The claims-managed failure, shown instead of the list. */
  readonly error?: string | undefined;
  readonly loading?: boolean | undefined;
  readonly onAddDirectoryGroup?: (
    externalId: string,
    displayLabel?: string
  ) => void;
  readonly onArchiveGroup?: (groupId: string) => void;
  readonly onRestoreGroup?: (groupId: string) => void;
  readonly onDeleteGroup?: (groupId: string) => void;
  readonly onEditLabel?: (groupId: string, displayLabel: string | null) => void;
  readonly onCreateLocalGroup?: (name: string, description: string) => void;
  readonly onUpdateLocalGroup?: (
    groupId: string,
    name: string,
    description: string
  ) => void;
  readonly onDeleteLocalGroup?: (groupId: string) => void;
  readonly onAddMembers?: (groupId: string, userIds: readonly string[]) => void;
  readonly onRemoveMembers?: (
    groupId: string,
    userIds: readonly string[]
  ) => void;
  readonly onRemoveAllMembers?: (groupId: string) => void;
  /** Assign a role to the group through the one role-assignment service (R-24b). */
  readonly onAssignRole?: (groupId: string, roleId: string) => void;
  /** Remove one of the group's role assignments. */
  readonly onUnassignRole?: (groupId: string, assignmentId: string) => void;
  /** Opens the Access screen with this group chosen (the one assignment writer, DEC-39). */
  readonly onOpenInAccess?: (groupId: string) => void;
};

/** One group's detail as the inspector reads it. */
export type GroupInspectorProps = {
  readonly group: Group;
  readonly members: readonly GroupMember[];
  readonly assignments: readonly GroupAssignment[];
  readonly viewer: GroupsViewer;
  readonly people: readonly PersonOption[];
  readonly roles: readonly AssignableRole[];
  readonly lastAdministrator: boolean;
  readonly onClose: () => void;
  readonly onArchive: () => void;
  readonly onRestore?: (() => void) | undefined;
  readonly onDelete: () => void;
  readonly onEditLabel: (displayLabel: string | null) => void;
  readonly onEditLocal: (name: string, description: string) => void;
  readonly onOpenInAccess?: (() => void) | undefined;
  readonly onAssignRole: (roleId: string) => void;
  readonly onUnassignRole: (assignmentId: string) => void;
  readonly onAddMembers: (userIds: readonly string[]) => void;
  readonly onRemoveMembers: (userIds: readonly string[]) => void;
  readonly onRemoveAllMembers: () => void;
};
