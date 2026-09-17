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
  /** Server-derived from the tenant's Keycloak realm. False for a brokered-only realm; the local accounts switch is then disabled. */
  supportsLocalAccounts: boolean
}

interface ConfigFieldBase {
  key: string
  title: string
  description: string
  required?: boolean
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
}

/** The core `category` row (DEC-51). Counts are server-derived: solutions from `solution_category`, modules from `tenant_module.category_id`. */
export interface Category {
  id: string
  name: string
  position: number
  solutionCount: number
  moduleCount: number
}

/** One module compiled into the image, joined to its `tenant_module` row (DEC-50). */
export interface CompiledModule {
  id: string
  displayName: string
  description: string
  /** `tenant_module.enabled`. Off hides the module's navigation and refuses its routes; data stays. */
  enabled: boolean
  /** `tenant_module.category_id`. Null for no category; Solutions carries none because its entries carry their own. */
  categoryId: string | null
  /** `<id>:use`, the key every workspace entry of the module requires. */
  useKey: string
  /** The seeded `<Display name> user` role that carries `useKey`. */
  userRoleName: string
  /** Server-derived from `role_assignment`: who holds a role carrying `useKey`. Read only here; changes happen on the Roles screen. */
  holders: {
    groups: Array<{ id: string; name: string; memberCount: number }>
    people: Array<{ id: string; name: string }>
  }
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
  /** Core categories in position order. */
  categories: Category[]
  /** Solutions with no category or a deleted one; shown on the Other row of the Categories page. Modules ungrouped are derived from `modules`. */
  ungroupedSolutionCount: number
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
  /** Administrator opens an audit event's target in its own screen. */
  onOpenAuditTarget?: (targetType: string, targetId: string) => void
  /** Administrator copies an event id for a support ticket. */
  onCopyEventId?: (eventId: string) => void
  /** Administrator saves one core settings card. */
  onSaveTenantSettings?: (input: TenantSettingsInput) => void
  /** Administrator saves one module configuration card. Validated against the same schema on the server. */
  onSaveModuleConfig?: (moduleId: string, values: Record<string, ConfigValue>) => void
  /** Administrator switches a module on or off; writes `tenant_module.enabled` through the same core procedure as the command line. */
  onSetModuleEnabled?: (moduleId: string, enabled: boolean) => void
  /** Administrator places a module in a core category or removes it from one; writes `tenant_module.category_id`. */
  onSetModuleCategory?: (moduleId: string, categoryId: string | null) => void
  /** Administrator creates a core category at the end of the order. */
  onCreateCategory?: (name: string) => void
  /** Administrator renames a category inline. */
  onRenameCategory?: (categoryId: string, name: string) => void
  /** Administrator reorders categories; positions follow the array order. */
  onReorderCategories?: (orderedIds: string[]) => void
  /** Administrator deletes a category, in use or not. Its solutions and modules become ungrouped; nothing else is deleted. */
  onDeleteCategory?: (categoryId: string) => void
}
