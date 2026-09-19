export type OnboardingMode = 'invite' | 'jit'
export type DateRangePreset = 'today' | '7d' | '30d' | 'custom'

/** Server-derived from `audit_event.actor_user_id` joined to `user`; `anonymized` comes from the erasure state, never from the client. */
export interface AuditActor {
  id: string
  name: string
  /** Empty for an anonymized (erased) person. */
  email: string
  /** True after personal-data erasure; the name is a placeholder such as "Removed person". */
  anonymized?: boolean
}

export interface AuditEvent {
  id: string
  occurredAt: string
  /** Null for a system event (a job, provisioning, the operator CLI). */
  actor: AuditActor | null
  /** `module:verb` key, for example `core:person:added` or `solutions:status:changed`. */
  action: string
  targetType: string
  targetId: string
  /** Server-derived at read time by resolving (target_type, target_id); not stored on the event. */
  targetLabel: string
  /** Server-derived at read time. False when the target was removed since; the sheet shows Removed and no link. */
  targetExists: boolean
  /**
   * Where Open goes, supplied by the owning module's record resolver and authorized for this
   * reader, or null. A resolver may return a label with no path (`architecture/module-contract.md`),
   * and a reader may be allowed to read the event but not the record, so an existing target is not
   * by itself an openable one. Open renders only when this is a path; the screen never builds one.
   */
  targetPath: string | null
  summary: string
  metadata: Record<string, unknown>
}

export interface AuditFilterOptions {
  actors: AuditActor[]
  /** Every action key that appears in the tenant, grouped by the module prefix in the UI. */
  actions: string[]
  targetTypes: string[]
}

export interface AuditFilters {
  query: string
  actorId: string | 'all' | 'system'
  action: string | 'all'
  targetType: string | 'all'
  range: DateRangePreset
  from: string | null
  to: string | null
}

export interface TenantSettings {
  onboardingMode: OnboardingMode
  localAccountsEnabled: boolean
  /** 5 to 480, default 15. */
  sessionIdleMinutes: number
  updatedBy: string
  updatedAt: string
}

export interface TenantRealm {
  /** `tenant_settings.realm_supports_local_accounts`, written by the realm step of `genie-ops setup` from the template variant it applied (DEC-36). False for a brokered-only realm; the local accounts switch is then disabled. */
  supportsLocalAccounts: boolean
}

interface ConfigFieldBase {
  key: string
  title: string
  description: string
  required?: boolean
  /**
   * Words a person might search for that the title and the description do not contain, for example
   * "logout" for an idle timeout. The settings search reads them. A module declares them on its
   * `configSchema` field, which the module contract does not carry yet
   * (`product/amendments-settings-2026-09-18.md`, A2).
   */
  keywords?: string[]
}
export interface StringField extends ConfigFieldBase { kind: 'string'; maxLength?: number; pattern?: string; patternMessage?: string }
export interface NumberField extends ConfigFieldBase { kind: 'number'; min?: number; max?: number; step?: number }
export interface BooleanField extends ConfigFieldBase { kind: 'boolean' }
export interface EnumField extends ConfigFieldBase { kind: 'enum'; options: Array<{ value: string; label: string }> }
export interface StringListField extends ConfigFieldBase { kind: 'string-list'; itemLimit?: number; pattern?: string; patternMessage?: string; placeholder?: string }
/** The five field kinds ConfigForm supports (DEC-28). A module that needs more ships its own page. */
export type ConfigField = StringField | NumberField | BooleanField | EnumField | StringListField

export type ConfigValue = string | number | boolean | string[]

export interface ModuleConfig {
  moduleId: string
  moduleName: string
  description: string
  /** Fields in declared order, converted from the module's zod schema. */
  schema: ConfigField[]
  values: Record<string, ConfigValue>
  updatedBy: string | null
  updatedAt: string | null
  /**
   * `tenant_module.enabled`. An installed module that is switched off keeps its settings section, so
   * a tenant can prepare the configuration before enabling it (`architecture/module-removal.md`,
   * "Reintroduction"). Saving settings writes `tenant_module.config` and never `enabled`.
   */
  enabled: boolean
  /** Design fixture only: a made-up module that shows how the navigator holds a long list. Never a product requirement. */
  synthetic?: boolean
}

export type SettingsGroup = 'tenant' | 'modules'

/** One row of the settings navigator. A core section is owned by core; a module section is one `ModuleConfig`. */
export interface SettingsSectionSummary {
  id: string
  name: string
  group: SettingsGroup
  description: string
  /** Module sections only. */
  moduleId?: string
  /** Module sections only: the module is installed and switched off. */
  disabled?: boolean
  /** Module sections only: a scale fixture, drawn with a Sample pill. */
  synthetic?: boolean
}

/**
 * One hit of the settings search. The index holds the field title, its description, its keywords, and
 * the section name. It never holds a saved value and never a secret.
 */
export interface SettingsSearchHit {
  sectionId: string
  sectionName: string
  group: SettingsGroup
  fieldKey: string
  title: string
  description: string
}

/** The core `category` row (DEC-51). The count is server-derived from `tenant_module.category_id` only; core reads no module table, so there is no solutions count. */
export interface Category {
  id: string
  name: string
  position: number
  moduleCount: number
}

/**
 * How the server will let this module be activated. It comes from the core enable procedure, the
 * same one `genie-ops module enable` calls, and it is never derived on the client.
 *
 * `ready` is an ordinary installed module. The switch enables it at once, and switching it off and
 * on again keeps that simpler flow.
 *
 * `review-required` is a module that returned to the image after a controlled removal. It registers
 * disabled whatever its former state was, and it stays disabled until an administrator reads the
 * retained configuration and the retained access, the required configuration is valid, and the
 * administrator confirms (`architecture/module-removal.md`, "Reintroduction and deliberate access
 * restoration").
 *
 * A switched-off ordinary module and a reintroduced module both carry `enabled: false`, so
 * `enabled === false` must never be read as reintroduction.
 */
export type ModuleActivationState = 'ready' | 'review-required'

/**
 * One role assignment the tenant still holds for a reintroduced module. Read only on this screen:
 * every assignment change happens on the central Access screen (`DEC-39`), and this list links
 * there rather than carrying a second permission editor.
 */
export interface RetainedGrant {
  id: string
  /** The group or the person the assignment names, so the row can link straight into Access. */
  recipientId: string
  /** The group or the person the assignment names. */
  recipientName: string
  recipientKind: 'group' | 'person'
  /** Groups only: current members, so the administrator can read how far the grant reaches. */
  memberCount?: number
  /** The role that carries the module's keys, for example `Approvals user`. */
  roleName: string
  /** What the assignment covers: the whole module, or one named record. */
  scopeLabel: string
  /**
   * The server's verdict for this activation, read now. `valid` restores when the module is enabled.
   * `invalid` does not restore in this activation, and it is shown so the administrator can see it,
   * not act on it here. It is a point in time, not a permanent revocation: the assignment is kept,
   * and a later membership, status, scope, permission, or entitlement change is judged again by
   * ordinary authorization. Nothing here deletes an assignment or bars it for good.
   */
  status: 'valid' | 'invalid'
  /** `invalid` only: why it does not restore now, for example an archived group or a permission the module no longer declares. */
  reason?: string
}

/**
 * One line of the retained configuration, ready to read. The server renders it, for two reasons.
 * Core holds no copy of the module's schema on this screen, so it cannot turn a stored value into a
 * label. And the server decides what may leave the tenant: a secret is never sent, and reads as a
 * placeholder instead.
 */
export interface RetainedConfigField {
  key: string
  /** The field title the module declares, for example `Register name`. */
  title: string
  /** The value as the server chose to show it: an enum reads as its label, an unset field as `Not set`, a secret as a placeholder. */
  value: string
  /** Absent when the field is fine. `missing` is a required field with no value; `invalid` is one the schema refuses. */
  status?: 'missing' | 'invalid'
  /** `missing` or `invalid` only: what to fix, in words an administrator can act on. */
  message?: string
}

/**
 * The server's activation verdict for one module. Every field other than `state` belongs to
 * `review-required` and is absent for `ready`.
 *
 * The design repository does not decide how the review is recorded durably, nor which tables hold
 * it. That is a backend contract, raised in `product/amendments-modules-2026-09-19.md`.
 */
export interface ModuleActivation {
  state: ModuleActivationState
  /** When the module returned to the image, as an ISO instant. */
  returnedAt?: string
  /** Every assignment the tenant kept, valid and invalid alike, in server order. */
  retainedGrants?: RetainedGrant[]
  /**
   * The configuration the tenant kept, in the module's declared field order, ready to read. The
   * review shows it, because the administrator decides here and must not have to leave to see what
   * the module will run with. It is read-only: editing stays in the module's settings section, which
   * the review links to.
   */
  retainedConfig?: RetainedConfigField[]
  /**
   * The server's verdict on the module's required configuration. Activation is refused while this
   * is `invalid`, and the field or fields at fault carry their own `status` in `retainedConfig`.
   */
  configStatus?: 'valid' | 'invalid'
  /** `configStatus: 'invalid'` only: the one-line summary above the field list. */
  configMessage?: string
  /** Short, plain facts about what enabling does not bring back, for example revoked credentials or stopped schedules. */
  notRestored?: string[]
}

/** One module compiled into the image, joined to its `tenant_module` row (DEC-50). */
export interface CompiledModule {
  id: string
  displayName: string
  description: string
  /** `tenant_module.enabled`. Off hides the module's navigation and refuses its routes; data stays. */
  enabled: boolean
  /** `tenant_module.category_id`. Null for no category. The picker shows for every module with at least one static workspace entry, the solutions hub included (DEC-49, DEC-50); a module with none shows no picker. */
  categoryId: string | null
  /** How many static workspace entries the module declares. Zero means no category picker and no Assign items row (R-84). */
  staticEntries: number
  /** `<id>:use`, the key every workspace entry of the module requires. */
  useKey: string
  /** The seeded `<Display name> user` role that carries `useKey`. */
  userRoleName: string
  /** Server-derived from `role_assignment`: who holds a role carrying `useKey`. Read only here; changes happen on the Roles screen. */
  holders: {
    groups: Array<{ id: string; name: string; memberCount: number }>
    people: Array<{ id: string; name: string }>
  }
  /**
   * The server's activation verdict. Required, so a host must answer it rather than let the screen
   * guess from `enabled`.
   */
  activation: ModuleActivation
}

/**
 * One row of Assign items.
 *
 * A `module` row is core's own data: the write is `tenant_module.category_id`, behind
 * `core:settings:manage`. A `record` row belongs to a module. Core neither reads nor writes a module
 * table (`DEC-51`), so the module contributes the row and performs the write through its own
 * procedure, behind its own key. The interface that carries this does not exist yet and is raised as
 * an amendment (`product/amendments-categories-2026-09-18.md`, A1 and A2).
 */
export interface AssignableItem {
  id: string
  label: string
  /** One scan fact, for example the status or what the entry covers. */
  detail: string
  kind: 'module' | 'record'
  /** The module that owns the row. A module row owns itself. */
  ownerModuleId: string
  /** What the row is called, for example Module or Solution. */
  typeLabel: string
  categoryId: string | null
  /** The permission key the write needs, for example `core:settings:manage` or `solutions:admin`. */
  writeKey: string
}

export interface SettingsViewer {
  id: string
  name: string
  permissions: string[]
  timeZone: string
}

export interface TenantSettingsInput {
  onboardingMode: OnboardingMode
  localAccountsEnabled: boolean
  sessionIdleMinutes: number
}

/**
 * The components trust the host for permission gating: Audit log is mounted only for `core:audit:read`,
 * Tenant settings, Modules, and Categories only for `core:settings:manage`. None renders a denied state.
 */
export interface AuditAndTenantSettingsProps {
  viewer: SettingsViewer
  auditEvents: AuditEvent[]
  /** Every module compiled into the image, enabled or not. */
  modules: CompiledModule[]
  /** Core categories in position order. The Other row's modules count is derived from `modules` (DEC-51). */
  categories: Category[]
  /** Total in the tenant after filters; the footer reads Showing n of total. */
  auditTotal: number
  auditFilterOptions: AuditFilterOptions
  tenantSettings: TenantSettings
  realm: TenantRealm
  moduleConfigs: ModuleConfig[]
  /** Administrator changes a filter; the list reloads from the first page. */
  onChangeAuditFilters?: (filters: AuditFilters) => void
  /** Administrator loads the next page of events. */
  onLoadMoreAuditEvents?: () => void
  /** Administrator opens an audit event's target in its own screen, at the path the server supplied on the event. The screen never invents a destination. */
  onOpenAuditTarget?: (path: string) => void
  /** Administrator copies an event id for a support ticket. */
  onCopyEventId?: (eventId: string) => void
  /** Administrator saves one core settings section. It resolves on success and rejects on failure. */
  onSaveTenantSettings?: (input: TenantSettingsInput) => void | Promise<void>
  /**
   * Administrator saves one module's settings section. Validated against the same schema on the
   * server. It writes `tenant_module.config` only: it never writes `tenant_module.enabled`, so
   * saving cannot enable a module. It resolves on success and rejects on failure.
   */
  onSaveModuleConfig?: (moduleId: string, values: Record<string, ConfigValue>) => void | Promise<void>
  /**
   * Administrator switches a module on or off; writes `tenant_module.enabled` through the same core
   * procedure as the command line. It carries the ordinary flow only: a module whose
   * `activation.state` is `review-required` is enabled through `onActivateModule` instead, and the
   * server refuses this path for it.
   */
  onSetModuleEnabled?: (moduleId: string, enabled: boolean) => void
  /**
   * Administrator finishes the retained-access review of a reintroduced module and confirms
   * activation.
   *
   * The server runs the shared activation procedure that `genie-ops module enable` runs. It re-reads
   * the retained grants, re-checks the required configuration, records the review, and enables the
   * module in one step. The confirmation on this screen is the administrator's decision, not the
   * enforcement: a client that skips it must still be refused.
   *
   * It resolves on success and rejects with the server's reason on failure. A rejection leaves the
   * module disabled and restores nothing.
   */
  onActivateModule?: (moduleId: string) => void | Promise<void>
  /** Administrator places a module in a core category or removes it from one; writes `tenant_module.category_id`. */
  onSetModuleCategory?: (moduleId: string, categoryId: string | null) => void
  /** Every row the Assign items table offers: the modules with a static workspace entry, and the records each enabled module contributes. */
  assignableItems: AssignableItem[]
  /** Administrator files one item. It resolves on success and rejects on failure, so a failed save never reads as a saved one. */
  onSetItemCategory?: (itemId: string, categoryId: string | null) => void | Promise<void>
  /** Administrator creates a core category at the end of the order. */
  onCreateCategory?: (name: string) => void
  /** Administrator renames a category inline. */
  onRenameCategory?: (categoryId: string, name: string) => void
  /** Administrator reorders categories; positions follow the array order. */
  onReorderCategories?: (orderedIds: string[]) => void
  /** Administrator deletes a category, in use or not. Its solutions and modules become ungrouped; nothing else is deleted. */
  onDeleteCategory?: (categoryId: string) => void
}
