export type PrincipalType = 'user' | 'group'
export type GroupSource = 'idp' | 'local'
export type LevelId = 'use' | 'admin' | 'audit'

/**
 * Who receives access. A group is the normal path and a person is the exception
 * (`architecture/access-model.md`, "Per-person assignments").
 */
export interface Recipient {
  id: string
  type: PrincipalType
  name: string
  /** Email for a person, the member count line for a group. */
  detail: string
  /** Groups only. */
  source?: GroupSource
  /** Groups only. An archived directory group keeps its grants and grants nothing while archived. */
  archived?: boolean
  /** Groups only. The directory stopped sending the group. */
  stale?: boolean
  /** People only. A disabled person keeps grants and cannot sign in. */
  status?: 'active' | 'pending' | 'disabled'
  /** People only. The groups the person belongs to, which is how most access arrives. */
  groupIds?: string[]
}

/** One record a grant can point at, from the module's declared record type. */
export interface AccessRecord {
  /** The scope id written to `role_assignment.scope_id`. */
  id: string
  /** The scope type written to `role_assignment.scope_type`. */
  type: string
  moduleId: string
  label: string
  /** One scan fact, for example the status or the category. */
  detail: string
}

/**
 * One level of access a module offers, derived from the roles the module declares
 * (`architecture/module-contract.md`, "Default roles"). The screen never invents a role.
 */
export interface AccessLevel {
  id: LevelId
  label: string
  description: string
  /** The permission key the role behind this level carries, for example `solutions:use`. */
  permissionKey: string
  /** The predefined role. Null when the module declares none, which the screen reports. */
  roleId: string | null
  roleName: string | null
  /** Why the level cannot be granted, when `roleId` is null. */
  missingRoleNote?: string
  /** True when a grant at this level can point at single records. An admin key is never record-scoped. */
  recordScoped: boolean
}

export interface AccessModule {
  id: string
  name: string
  description: string
  /** `tenant_module.enabled`. A disabled module keeps its grants, and they apply again when it is enabled. */
  enabled: boolean
  /** True for core administration, which is always present and never a module entitlement. */
  isCore?: boolean
  /** The record type its grants can point at. Null when the module declares none, so a grant is module-wide. */
  recordType: { type: string; label: string; pluralLabel: string } | null
  levels: AccessLevel[]
}

/** One `role_assignment` row, read through core. */
export interface Grant {
  id: string
  recipientId: string
  recipientType: PrincipalType
  moduleId: string
  /** `custom` marks a grant made with a custom role, which the level picker does not own. */
  level: LevelId | 'custom'
  roleId: string
  roleName: string
  /** Null for a whole-tenant grant: every record of the module, including the ones added later. */
  scopeType: string | null
  scopeId: string | null
  createdBy: string
  createdAt: string
}

/**
 * One row of the everyday catalogue. Every row means the same thing, "can use", and maps to one
 * predefined role: a solution row to the solutions user role scoped to that solution, a module row
 * to that module's user role with no scope, because the module owns no records to scope to.
 */
export interface CatalogItem {
  /** A record id for a solution row, `m:<moduleId>` for a module row. */
  id: string
  kind: 'solution' | 'module'
  moduleId: string
  label: string
  detail: string
  /** The module is switched off. The grant is kept and gives nothing until it is switched on. */
  inactive: boolean
  /** Why this row cannot be granted now, or null. A blocked row stays removable. */
  blockedReason: string | null
}

/**
 * Access to every record of a module, now and later. It is one assignment with no scope, and it is
 * never mixed with the catalogue rows, because it also covers records that do not exist yet.
 */
export interface BroaderGrant {
  /** `all:<moduleId>`. */
  id: string
  moduleId: string
  label: string
  consequence: string
  inactive: boolean
  /** Why this grant cannot be added now, or null. A blocked row stays removable. */
  blockedReason: string | null
}

/** A change that waits for Save. Nothing is written before that. */
export interface PendingChange {
  kind: 'grant' | 'revoke'
  recipientId: string
  moduleId: string
  /** `custom` marks a change made with a role picked directly, which no level owns. */
  level: LevelId | 'custom'
  /** Set when `level` is `custom`: the role the secondary path picked. */
  roleId?: string
  /** Null means the whole-tenant grant. */
  scopeId: string | null
  /** The record type behind `scopeId`, when the secondary path supplies one. */
  scopeType?: string | null
  /** What the row says in the pending list, for example "Claims Triage Assistant". */
  label: string
  /** Set on a revoke that undoes an existing row. */
  grantId?: string
}

/**
 * What the save procedure answers. The server holds the last-active-administrator rule and the
 * self-protection rule, so it can refuse a batch the screen believed was allowed, for example when
 * somebody else removed the other administrator while this screen was open. A refusal keeps the
 * pending list, so nothing an administrator selected is thrown away.
 */
export type SaveResult = { ok: true } | { ok: false; reason: string }

/** What the Overview loads results for. Nothing loads before one is chosen. */
export type OverviewSubject =
  | { kind: 'recipient'; id: string }
  | { kind: 'module'; id: string }
  | { kind: 'record'; id: string }

/**
 * One line of the Overview: one grant path to one target. The server answers a subject with one
 * paged query over `role_assignment`; the design derives the same rows from `grants`, so the two
 * lists cannot drift apart.
 */
export interface EffectiveAccessRow {
  id: string
  /** The group or the person that holds the assignment. */
  holderId: string
  holderType: PrincipalType
  holderName: string
  moduleId: string
  moduleName: string
  /** The record, or null for every record of the module, now and later. */
  targetId: string | null
  targetLabel: string
  roleName: string
  level: LevelId | 'custom'
  /** "Direct assignment" for the subject themselves, otherwise "via <group name>". */
  source: string
  /**
   * Another path that reaches the same target for the same effective person, or null. Two unrelated
   * holders of one record are never each other's alternate path, so a module or record lookup only
   * sets this when one holder carries both rows.
   */
  alsoThrough: string | null
  addedBy: string
  addedAt: string
  /** Why the grant does not apply right now: an archived group or a disabled module. */
  inactiveReason: string | null
}

export interface AccessProps {
  /** The signed-in administrator. Self-protection and the last-administrator rule read it. */
  currentUserId?: string
  recipients: Recipient[]
  modules: AccessModule[]
  records: AccessRecord[]
  grants: Grant[]
  /** Roles offered by the secondary path, which assigns one role directly. */
  customRoles: { id: string; name: string; description: string; kind: 'system' | 'custom'; moduleId: string | null; tenantWideOnly: boolean }[]
  /**
   * Save the pending list as one batch, through the one assignment procedure. The secondary path,
   * "Assign a role directly", stages its request into this same list, so there is one writer.
   */
  onSave?: (changes: PendingChange[]) => SaveResult
  /** Open another admin screen, for example the audit log or a group. */
  onNavigate?: (href: string) => void
}
