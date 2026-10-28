import type {
  RoleAssignmentRow as RoleAssignment,
  RoleDetail,
  RolePermissionGroup,
  RolePermissionKey,
  RoleRow as Role,
  UnavailableKey,
  UnavailableReason,
} from "../../services/roles/index.ts";

/**
 * The presentation types of the Roles screen. The role, key and assignment views come from the roles
 * service through a type-only import, which the browser-safety guard skips. The kind name, the
 * viewer, the form input and the screen props are screen-only.
 */
export type {
  Role,
  RoleAssignment,
  RoleDetail,
  RolePermissionGroup,
  RolePermissionKey,
  UnavailableKey,
  UnavailableReason,
};

export type RoleKind = Role["kind"];

export type RolesViewer = {
  readonly id: string;
  readonly timeZone: string;
};

export type RoleInput = {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly string[];
};

export type RolesScreenProps = {
  readonly roles: readonly Role[];
  readonly viewer: RolesViewer;
  /** The search field's label and placeholder, from the host catalogue (DEC-13). */
  readonly searchLabel: string;
  /**
   * The declared permission catalogue the role form picks from, grouped by module with each
   * module's entitlement state (R-33). A new role is built from this, never from a stored role.
   */
  readonly catalogue: readonly RolePermissionGroup[];
  readonly selectedRoleId: string | null;
  readonly onSelectRole: (roleId: string | null) => void;
  /** The selected role's grouped permissions and holders, loaded by the host on selection. */
  readonly detail?: RoleDetail | undefined;
  readonly error?: string | undefined;
  readonly loading?: boolean | undefined;
  /** A write is running, so every button that writes shows the loading state (tokens.md "Buttons"). */
  readonly pending?: boolean | undefined;
  /**
   * The role form's saves. Each resolves when the role is saved; a refusal rejects with the copy to
   * show as its `message`, and the form stays open with it (U-1).
   */
  readonly onCreateRole?: (input: RoleInput) => Promise<void> | void;
  readonly onUpdateRole?: (
    roleId: string,
    input: RoleInput
  ) => Promise<void> | void;
  /** The detail's Remove on an unavailable key: the role saved without that key (R-33b). */
  readonly onRemoveUnavailableKey?: (roleId: string, input: RoleInput) => void;
  readonly onDeleteRole?: (roleId: string) => void;
  readonly onOpenInAccess?: (roleId: string) => void;
};
