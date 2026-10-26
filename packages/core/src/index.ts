/**
 * The core runtime surface. An app and a module import from here; the build-safe subpaths
 * `@genie/core/contracts` and `@genie/core/tenant-config` stay free of any runtime dependency.
 *
 * Core exports the tenant-context factory and no `db`, `settings`, `branding` or `storage`
 * singleton (R-17, DEC-34).
 */

export {
  createPublicUrl,
  createTenantContext,
  type AuthEnvironment,
  type CategoryReader,
  type DeploymentEnvironment,
  type FileStorageAdapter,
  IDENTITY_CALLBACK_PATH,
  type NavigationCategory,
  type PublicUrlBuilder,
  type TenantContext,
} from "./lib/tenant-context/index.ts";

export {
  activityThrottleWaitMs,
  APPLICATION_SESSION_FIELDS,
  APPLICATION_USER_FIELDS,
  type AuthActivityResult,
  type AuthDiscoveryCause,
  type AuthDiscoveryState,
  type AuthMember,
  type AuthOwnSession,
  type AuthRevokeSessionResult,
  type AuthSession,
  type AuthSessionState,
  type AuthSessionUser,
  type BreakGlassFacts,
  type BreakGlassStep,
  BREAK_GLASS_ONLY_CODE,
  BREAK_GLASS_OAUTH_REFUSED,
  breakGlassNextStep,
  breakGlassSteps,
  createAuthMember,
  createDiscoveryProbe,
  describeUserAgent,
  DISCOVERY_RETRY_MS,
  discoveryDocumentUrl,
  idleExpiry,
  INVALID_CREDENTIALS_MESSAGE,
  INVALID_EMAIL_OR_PASSWORD_CODE,
  isIdleExpired,
  isLimitedBreakGlass,
  KEYCLOAK_ISSUER_MISMATCH,
  KEYCLOAK_PROVIDER_ID,
  keycloakIssuer,
  keycloakProviderConfig,
  LIMITED_SESSION_CLEARING_ENDPOINTS,
  normalizeKeycloakUrl,
  PASSWORD_POLICY_CODE,
  RATE_LIMITED_CODE,
  readCookie,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_COOKIE_NAME,
  sessionCookieName,
  TOTP_ISSUER_DEFAULT,
  TRUST_DEVICE_REFUSED,
} from "./services/auth/index.ts";

export {
  flushRefusalAudit,
  syncGroupMemberships,
} from "./services/auth/onboarding.ts";

export {
  assertKeycloakAddress,
  BUNDLED_KEYCLOAK_PROFILE,
  checkKeycloakAddress,
  KEYCLOAK_ADDRESS_MESSAGES,
  type KeycloakAddressCause,
  type KeycloakAddressEnvironment,
  type KeycloakAddressFacts,
  type KeycloakAddressInput,
  type KeycloakAddressResult,
  KeycloakAddressError,
  keycloakAddressResult,
  stackProfiles,
} from "./services/keycloak/address-guard.ts";

// The JSON value shape the realm and client representations are built from; the client-only e2e
// imports a shipped client file as one of these (R-54a).
export {
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "./services/keycloak/representation.ts";

export {
  assertKeycloakIssuerAtStart,
  KEYCLOAK_ISSUER_MISMATCH_MESSAGE,
  KeycloakIssuerError,
  type KeycloakIssuerInput,
} from "./services/keycloak/startup.ts";

export {
  type AfterCommit,
  type AfterCommitEntry,
  contextLoggerOf,
  type TenantTransaction,
  withTransaction,
} from "./lib/tenant-context/with-transaction.ts";

export { CorrelationScope } from "./lib/correlation/index.ts";

export {
  httpUrl,
  supportContact,
  type SupportContact,
} from "./lib/branding/support.ts";

export { brandingTokens } from "./lib/branding/tokens.ts";

export type {
  BrandingTokens,
  BrandingTokenSource,
} from "./lib/branding/tokens.ts";

export { registerModuleRuntime } from "./lib/module-contract/runtime.ts";

export {
  type EnvironmentProfile,
  type EnvironmentSource,
  validateEnvironment,
} from "./lib/environment/index.ts";

export {
  AppError,
  type AppErrorIssue,
  CORE_ERROR_MESSAGES,
  CORE_ERRORS,
  type CoreErrorCode,
  type ErrorDefinition,
  GENERIC_ERROR_CODE,
  type ModuleErrorDefinition,
  defineModuleErrors,
  moduleErrorCode,
  type SafeErrorBody,
  safeBodyFor,
  safeMessageFor,
} from "./lib/errors/index.ts";

export {
  AUDITOR_ROLE,
  CORE_PERMISSION_KEYS,
  can,
  createGrantReader,
  createRecordResolver,
  createRequestPrincipal,
  GENIE_ADMINISTRATORS_GROUP,
  type GrantReader,
  type RecordResolver,
  PERMISSION_TRANSFORMATION_ACTION,
  type PermissionGrants,
  permissionCatalogue,
  type PrincipalIdentity,
  principalFor,
  readOwnGroups,
  type OwnGroup,
  readRoleSummaries,
  type RequestPrincipal,
  type RoleSummaryRow,
  scopesFor,
  seedRoles,
  TENANT_ADMINISTRATOR_ROLE,
} from "./services/authorization/index.ts";

export {
  assignRole,
  assignRoleInTransaction,
  type AssignmentPrincipal,
  type AssignmentWrite,
  removeAssignment,
  removeGroupAssignments,
  removeUserAssignments,
} from "./services/authorization/role-assignment.ts";

export {
  assertAdministratorRemains,
  assertNotSelf,
  countActiveAdministrators,
  lockAdministratorGuard,
} from "./services/authorization/administrators.ts";

export {
  type GroupsContract,
  groupsContract,
} from "./services/groups/contract.ts";

export {
  createGroupsRouter,
  type GroupsRouter,
} from "./services/groups/router.ts";

export {
  addDirectoryGroup,
  addLocalGroupMembers,
  archiveDirectoryGroup,
  createLocalGroup,
  deleteDirectoryGroup,
  deleteLocalGroup,
  type GroupAssignmentRow,
  type GroupDetail,
  type GroupMemberRow,
  type GroupRow,
  listGroups,
  readGroup,
  removeAllLocalGroupMembers,
  removeLocalGroupMembers,
  setGroupLabel,
  updateLocalGroup,
} from "./services/groups/index.ts";

export {
  type PeopleContract,
  peopleContract,
} from "./services/people/contract.ts";

export {
  createPeopleRouter,
  type PeopleRouter,
} from "./services/people/router.ts";

export {
  addPerson,
  type AddPersonInput,
  type AccountType as PersonAccountType,
  type AssignablePerson as PersonPickerOption,
  type AssignableRole as PersonAssignableRole,
  disablePerson,
  enablePerson,
  listAssignableRoles as listPersonAssignableRoles,
  listPeople,
  type PersonAssignmentRow,
  type PersonDetail,
  type PersonGroupRow,
  type PersonRow,
  type PersonSessionRow,
  type PersonStatus,
  readPerson,
  removePerson,
  resendInvitation,
  resendSetPassword,
} from "./services/people/index.ts";

export {
  type RolesContract,
  rolesContract,
} from "./services/roles/contract.ts";

export {
  createRolesRouter,
  type RolesRouter,
} from "./services/roles/router.ts";

export {
  copyRole,
  createRole,
  deleteRole,
  listRoles,
  readRole,
  type RoleAssignmentRow as AdminRoleAssignmentRow,
  type RoleDetail,
  type RolePermissionGroup,
  type RolePermissionKey,
  type RoleRow,
  type RolesModule,
  updateRole,
} from "./services/roles/index.ts";

export {
  CORE_NAVIGATION_ID,
  enabledNavigation,
  landingRoute,
  type PermittedEntry,
  permittedNavigation,
} from "./lib/entitlement/index.ts";

export {
  CORE_ADMIN_NAVIGATION,
  type CoreAdminGroupId,
} from "./lib/entitlement/core-admin.ts";

export {
  type AdminNavigationGroup,
  buildNavigationTree,
  type NavigationCategoryGroup,
  type NavigationTree,
  navigationTree,
} from "./lib/entitlement/tree.ts";

export {
  administration,
  DEFAULT_FAVICON_URL,
  faviconHref,
  loadShell,
  realmAccountUrl,
  type ShellLabels,
  type ShellModel,
  shellNavigation,
} from "./services/shell/index.ts";

// The server half of the module API (ADR 0011). A module router throws `AppError`, never a
// protocol error, so core re-exports no oRPC error; the browser-safe half is `@genie/core/rpc`.
export {
  implementModule,
  type ModuleContract,
  type ModuleImplementer,
  type ModuleRouter,
  type ModuleRPCContext,
} from "./lib/rpc/implement-module.ts";

export { callProcedure } from "./lib/rpc/call-procedure.ts";

export type {
  PermissionKey,
  ResourceRef,
  Scope,
  ScopeSet,
} from "./lib/module-contract/keys.ts";

export {
  isPermissionKey,
  permissionKeyFor,
} from "./lib/module-contract/keys.ts";

export type {
  AnySubscription,
  JobContext,
  JobDeclaration,
  Module,
  ModuleConfiguration,
  ModuleIdentity,
  ModuleNavigation,
  ModulePages,
  ModuleRequestContext,
  ModuleSchema,
  NavigationEntry,
  PermissionChange,
  PermissionDeclaration,
  PermissionTransformation,
  Subscription,
} from "./lib/module-contract/module.ts";

export { moduleLedgerTable } from "./lib/module-contract/ledger.ts";

export {
  validateModule,
  validateRegistry,
} from "./lib/module-contract/validate.ts";

export {
  CORE_HISTORY,
  MIGRATION_LOCK_KEY,
  type MigrationHistory,
  type MigrationLog,
  type MigrationRun,
  type ModuleHistorySource,
  migrationPlan,
  moduleHistory,
  runMigrations,
} from "./services/migrator/index.ts";

export {
  type MigrationFiles,
  type MigrationJournal,
  type MigrationJournalEntry,
  migrationsFromJournal,
} from "./services/migrator/history.ts";

export {
  type AdminAuditInput,
  type AuditEventInput,
  type AuditMetadataValue,
  writeAdminAuditEvent,
  writeAuditEvent,
  writeAuthAuditEvent,
} from "./services/audit/index.ts";

export {
  AUDIT_ACTIONS,
  type AuditAction,
  auditActionGroup,
  type AuditActorView,
  type AuditDateRange,
  type AuditEventCursor,
  type AuditEventFilters,
  type AuditEventView,
  type AuditFilterOptions,
  type AuditMetadata,
  type AuditPage,
  type AuditContract,
  auditContract,
  createAuditRouter,
  isOperatorAction,
  readAuditPage,
} from "./services/audit/index.ts";

export { type GenieOpsOptions, runGenieOps } from "./services/ops/index.ts";

export {
  rotateBreakGlass,
  type RotateBreakGlassOptions,
} from "./services/break-glass/index.ts";

export {
  consumeRateLimit,
  DEPLOYMENT_RATE_LIMIT_SUBJECT,
  type RateLimitDecision,
  type RateLimitEndpoint,
  RATE_LIMIT_RULES,
  type RateLimitRule,
  type RateLimitSubjectKind,
  windowStartFor,
} from "./services/rate-limit/index.ts";

export {
  characterClassCount,
  meetsPasswordRule,
  PASSWORD_CHARACTER_CLASSES,
  PASSWORD_MIN_LENGTH,
  type PasswordRuleRow,
  passwordRuleRows,
} from "./lib/password/rule.ts";

export type { JobQueue } from "./services/job-queue/index.ts";

export type {
  DurableEventQueue,
  EventBus,
  EventHandler,
  SubscriptionOptions,
} from "./services/event-bus/index.ts";

export type { CapabilityRegistry } from "./services/capabilities/index.ts";

export {
  type FetchedFile,
  FILE_DOWNLOAD_PATH,
  type FetchFileLinkInput,
  type FileLinkInput,
  type FileStorage,
  type StoredFile,
  type TokenizedFileLink,
  UPLOAD_ALLOWED_MIME_TYPES,
  type UploadFileInput,
} from "./services/file-storage/index.ts";

export {
  type Mailer,
  type MailProvider,
  type MailSendInput,
} from "./services/mailer/index.ts";

export {
  MAIL_TEMPLATE_IDS,
  type MailTemplateId,
  type MailTemplateVariables,
  type RenderedMail,
} from "./services/mailer/catalogue.ts";

export {
  DEFAULT_WORKER_HEARTBEAT_PATH,
  HEARTBEAT_JOB,
  runWorker,
  type WorkerOptions,
} from "./services/worker/index.ts";

export {
  type IntegrationConfig,
  type ResolvedIntegration,
  resolveIntegration,
} from "./services/integrations/index.ts";

export {
  type ModuleConfigIssue,
  type ModuleEnableResult,
  ModuleManagementError,
  type ModuleManagementErrorCode,
  setModuleEnabled,
  setModuleEnabledIn,
} from "./services/module-management/index.ts";

export { hasWorkspaceEntry } from "./lib/module-contract/workspace-entry.ts";

export {
  listModules,
  type ModuleHolder,
  type ModuleRow,
  setModuleCategory,
  switchModule,
} from "./services/modules/index.ts";

export {
  type CategoryList,
  type CategoryRow,
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
} from "./services/categories/index.ts";

export {
  type LogBindings,
  type RedactingLogger,
  createLogger,
  forExecution,
  redact,
} from "./services/logging/index.ts";

export {
  BASELINE_POLICY,
  collectFrameOrigins,
  type FrameOriginFailureOptions,
  type FrameOriginProvider,
  isFrameOrigin,
  normalizeFrameOrigins,
  serializeContentSecurityPolicy,
  STANDARD_HEADERS,
} from "./lib/content-security-policy/index.ts";

export {
  SETUP_STEPS,
  type SetupStepState,
  type SetupStepView,
  readSetupProgress,
  setupSatisfied,
  stepSettled,
} from "./services/setup/index.ts";

export {
  type ModulesContract,
  modulesContract,
} from "./services/modules/contract.ts";

export {
  createModulesRouter,
  type ModulesRouter,
} from "./services/modules/router.ts";

export {
  type CategoriesContract,
  categoriesContract,
} from "./services/categories/contract.ts";

export {
  createCategoriesRouter,
  type CategoriesRouter,
} from "./services/categories/router.ts";

export {
  type SettingsContract,
  settingsContract,
} from "./services/settings/contract.ts";

export {
  createSettingsRouter,
  type SettingsRouter,
} from "./services/settings/router.ts";

export {
  type BrandingContract,
  brandingContract,
} from "./services/branding/contract.ts";

export {
  createBrandingRouter,
  type BrandingRouter,
} from "./services/branding/router.ts";

export type {
  BrandingImageView,
  BrandingView,
} from "./services/branding/index.ts";

export type {
  BrandingDraft,
  BrandingImageSlot,
} from "./services/branding/schemas.ts";
