/**
 * The presentation types of the Roles screen. A browser-safe feature folder may not import the
 * design repository, so these mirror `docs/design/sections/people-groups-and-roles/types.ts` for
 * the role part, and are structurally compatible with the core service's read rows.
 */

export type RoleKind = "system" | "custom";

/** Why a stored key no longer grants: its module is switched off, or the key is retired/unknown. */
export type UnavailableReason = "module-disabled" | "retired";

/** One stored key outside the selectable catalogue, with why it is unavailable. */
export type UnavailableKey = {
  readonly key: string;
  readonly reason: UnavailableReason;
};

export type Role = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: RoleKind;
  readonly moduleId: string | null;
  readonly permissions: readonly string[];
  readonly assignmentCount: number;
  /** R-31: keys appended automatically when a module was entitled. */
  readonly entitlementAdded: readonly string[];
  /** R-33b: stored keys the entitled catalogue does not offer, each with why. */
  readonly unavailableKeys: readonly UnavailableKey[];
};

export type RolePermissionKey = {
  readonly key: string;
  readonly label: string;
  /** R-33b: the key is retired, or its module is switched off; it never grants. */
  readonly unavailable: boolean;
  /** Present exactly when `unavailable` is true. */
  readonly unavailableReason?: UnavailableReason | undefined;
};

export type RolePermissionGroup = {
  readonly moduleId: string;
  readonly moduleName: string;
  readonly entitled: boolean;
  readonly keys: readonly RolePermissionKey[];
};

export type RoleAssignment = {
  readonly id: string;
  readonly principalType: "user" | "group";
  readonly principalId: string;
  readonly principalLabel: string;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
};

export type RoleDetail = Role & {
  readonly permissionGroups: readonly RolePermissionGroup[];
  readonly assignments: readonly RoleAssignment[];
};

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
  readonly onCreateRole?: (input: RoleInput) => void;
  readonly onUpdateRole?: (roleId: string, input: RoleInput) => void;
  readonly onDeleteRole?: (roleId: string) => void;
  readonly onOpenInAccess?: (roleId: string) => void;
};
