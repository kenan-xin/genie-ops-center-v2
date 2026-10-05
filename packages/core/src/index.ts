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
  type DeploymentEnvironment,
  type FileStorageAdapter,
  IDENTITY_CALLBACK_PATH,
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

export { registerModuleRuntime } from "./lib/module-contract/runtime.ts";

export {
  type EnvironmentProfile,
  type EnvironmentSource,
  validateEnvironment,
} from "./lib/environment/index.ts";

export {
  AppError,
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
  createGroupsRouter,
  type GroupsRouter,
  type GroupsRouterContext,
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
  createPeopleRouter,
  type PeopleRouter,
  type PeopleRouterContext,
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
  createRolesRouter,
  type RolesRouter,
  type RolesRouterContext,
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
  enabledNavigation,
  landingRoute,
  permittedNavigation,
} from "./lib/entitlement/index.ts";

export {
  createModuleTRPC,
  type ModuleTRPCContext,
} from "./lib/entitlement/module-trpc.ts";

// The one tRPC value a module still raises, re-exported so a module router builds entirely on
// core: its `can()` denial throws a `FORBIDDEN` `TRPCError` without importing `@trpc/server`
// (d1y, the oxlint `no-restricted-imports` override bans `initTRPC` there).
export { TRPCError } from "@trpc/server";

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
  ModuleManagementError,
  type ModuleManagementErrorCode,
  setModuleEnabled,
} from "./services/module-management/index.ts";

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
} from "./services/setup/index.ts";
