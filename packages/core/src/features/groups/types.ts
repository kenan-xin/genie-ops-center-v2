import type {
  AssignableRole,
  GroupAssignmentRow as GroupAssignment,
  GroupMemberRow as GroupMember,
  GroupRow as Group,
} from "../../services/groups/index.ts";
import type { AssignablePerson as PersonOption } from "../../services/people/index.ts";
import type { NoMatchCopy } from "../admin/no-match.tsx";

/**
 * The presentation types of the Groups screen. The row views come from the groups and people
 * services through type-only imports, which the browser-safety guard skips. The source name, the
 * viewer and the screen and inspector props are screen-only.
 */
export type {
  AssignableRole,
  Group,
  GroupAssignment,
  GroupMember,
  PersonOption,
};

export type GroupSource = Group["source"];

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
  /** The search field's label and placeholder, from the host catalogue (DEC-13). */
  readonly searchLabel: string;
  /** The copy when the search and the archived filter match no group. */
  readonly noMatch: NoMatchCopy;
  readonly includeArchived: boolean;
  readonly onChangeIncludeArchived: (includeArchived: boolean) => void;
  /** Fires when a row opens or the inspector closes, so the host can load that group's detail. */
  readonly onSelectGroup?: (groupId: string | null) => void;
  /** A group to open on mount, for a link such as an audit target (`?selected=`). */
  readonly initialSelectedId?: string | undefined;
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
  /** The catalogue hint under an unlabelled group whose value looks like an id (R-24c). */
  readonly labelHint: string;
  /** R-38: group ids where archiving or removing a member would leave no administrator. */
  readonly lastAdministratorGroupIds: readonly string[];
  /** The claims-managed failure, shown instead of the list. */
  readonly error?: string | undefined;
  readonly loading?: boolean | undefined;
  /** A write is running, so every button that writes shows the loading state (tokens.md "Buttons"). */
  readonly pending?: boolean | undefined;
  /**
   * Resolves when the group is added. A refusal rejects with the copy to show as its `message`,
   * and the dialog stays open with it (U-1). The same holds for `onCreateLocalGroup`.
   */
  readonly onAddDirectoryGroup?: (
    externalId: string,
    displayLabel?: string
  ) => Promise<void> | void;
  readonly onArchiveGroup?: (groupId: string) => void;
  readonly onRestoreGroup?: (groupId: string) => void;
  readonly onDeleteGroup?: (groupId: string) => void;
  readonly onEditLabel?: (groupId: string, displayLabel: string | null) => void;
  readonly onCreateLocalGroup?: (
    name: string,
    description: string
  ) => Promise<void> | void;
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
  readonly pending?: boolean | undefined;
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
