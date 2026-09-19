export type PersonStatus = 'active' | 'pending' | 'disabled'
export type GroupSource = 'idp' | 'local'
export type RoleKind = 'system' | 'custom'
export type PrincipalType = 'user' | 'group'

export interface TenantSettingsSummary {
  onboardingMode: 'invite' | 'jit'
  localAccountsEnabled: boolean
  identitySource: string
}

export interface PermissionKey {
  key: string
  label: string
}

export interface RecordType {
  type: string
  label: string
}

export interface ModuleInfo {
  id: string
  name: string
  entitled: boolean
  permissionKeys: PermissionKey[]
  recordTypes: RecordType[]
}

export interface ScopeRecord {
  id: string
  type: string
  label: string
  moduleId: string
}

export interface Group {
  id: string
  name: string
  description: string
  source: GroupSource
  externalId: string | null
  memberCount: number
  /** Server-derived from the last sign-in token that carried the group. Null for local groups. */
  syncedAt: string | null
  /** Server-derived. Directory group that no longer arrives in the token. */
  stale: boolean
  lastSeenAt: string | null
  archived: boolean
}

export interface Role {
  id: string
  name: string
  description: string
  kind: RoleKind
  /** Module that seeded a system role. Null for custom roles. The Tenant administrator role is `kind: 'system'`, `moduleId: 'core'`, `name: 'Tenant administrator'`. */
  moduleId: string | null
  permissions: string[]
  /** Server-derived. Permission keys appended automatically when a module was entitled. Only the Tenant administrator role carries these. */
  entitlementAdded?: string[]
}

export type AccountType = 'brokered' | 'local'

export interface Person {
  id: string
  name: string
  email: string
  status: PersonStatus
  /** Brokered accounts sign in through the identity provider; local accounts hold a password in the tenant realm. A local account created while local accounts were on stays local after the setting is turned off. */
  accountType: AccountType
  /** Server-derived from accountType: the identity provider label, or "Genie (local password)". */
  identitySource: string
  groupIds: string[]
  firstSignInAt: string | null
  lastSignInAt: string | null
  onboarding: 'invited' | 'jit'
  /** Server-derived. Local accounts only: when the realm last sent the set-password email to a pending person. */
  setPasswordSentAt?: string | null
}

export interface RoleAssignment {
  id: string
  roleId: string
  principalType: PrincipalType
  principalId: string
  scopeType: string | null
  scopeId: string | null
  createdBy: string
  createdAt: string
}

export interface PersonSession {
  id: string
  personId: string
  device: string
  browser: string
  /** The client address, shown instead of a geographic location. */
  ipAddress: string
  signedInAt: string
  lastActiveAt: string
}

export interface NewPersonInput {
  email: string
  name?: string
  roleIds: string[]
  /** Only offered when local accounts are on; defaults to brokered. */
  accountType?: AccountType
}

export interface RoleInput {
  name: string
  description: string
  permissions: string[]
}

export interface PeopleGroupsAndRolesProps {
  tenantSettings: TenantSettingsSummary
  /** The signed-in administrator, so the UI can disable self-targeting actions. Also the seat of the last-administrator rule: no action may leave zero active holders of Tenant administrator. */
  currentUserId?: string
  modules: ModuleInfo[]
  scopeRecords: ScopeRecord[]
  people: Person[]
  groups: Group[]
  roles: Role[]
  roleAssignments: RoleAssignment[]
  sessions: PersonSession[]
  /** Add a person by email, optionally with a name and roles to assign now. */
  onAddPerson?: (input: NewPersonInput) => void
  /** Disable a person. They cannot sign in but keep history. */
  onDisablePerson?: (personId: string) => void
  /** Re-enable a disabled person. */
  onEnablePerson?: (personId: string) => void
  /** Remove a person from the tenant. */
  onRemovePerson?: (personId: string) => void
  /** Sign out one session of a person. */
  onRevokeSession?: (sessionId: string) => void
  /** Sign out every session of a person. */
  onRevokeAllSessions?: (personId: string) => void
  /** Add a person to a local group. */
  onAddToLocalGroup?: (personId: string, groupId: string) => void
  /** Remove a person from a local group. */
  onRemoveFromLocalGroup?: (personId: string, groupId: string) => void
  /** Create a local group. */
  onCreateLocalGroup?: (name: string, description: string) => void
  /** Edit a local group's name and description. */
  onUpdateLocalGroup?: (groupId: string, name: string, description: string) => void
  /** Archive a stale directory group. It keeps its assignments. */
  onArchiveGroup?: (groupId: string) => void
  /** Delete a local group; removes its memberships and role assignments after confirm. */
  onDeleteLocalGroup?: (groupId: string) => void
  /** Remove every member of a local group. */
  onRemoveAllMembers?: (groupId: string) => void
  /** Send the realm's set-password email again to a pending local-account person. */
  onResendSetPassword?: (personId: string) => void
  /** Create a custom role. */
  onCreateRole?: (input: RoleInput) => void
  /** Edit a custom role. */
  onUpdateRole?: (roleId: string, input: RoleInput) => void
  /** Copy a role into a new custom role, prefilled. */
  onCopyRole?: (roleId: string) => void
  /** Delete a custom role. */
  onDeleteRole?: (roleId: string) => void
  /**
   * Open the Access screen with this person, group, or role preselected. These screens read role
   * assignments and never write one: Access is the only writer (`DEC-39`).
   */
  onManageAccess?: (target: { kind: 'person' | 'group' | 'role'; id: string }) => void
}
