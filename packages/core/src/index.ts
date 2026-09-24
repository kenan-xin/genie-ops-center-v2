/**
 * The core runtime surface. An app and a module import from here; the build-safe subpaths
 * `@genie/core/contracts` and `@genie/core/tenant-config` stay free of any runtime dependency.
 *
 * Core exports the tenant-context factory and no `db`, `settings`, `branding` or `storage`
 * singleton (R-17, DEC-34).
 */

export {
  createTenantContext,
  type DeploymentEnvironment,
  type FileStorageAdapter,
  type TenantContext,
} from "./lib/tenant-context/index.ts";

export {
  type AfterCommit,
  type AfterCommitEntry,
  type TenantTransaction,
  withTransaction,
} from "./lib/tenant-context/with-transaction.ts";

export {
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
  can,
  createRequestPrincipal,
  createStubGrantReader,
  type GrantReader,
  type PermissionGrants,
  type PrincipalIdentity,
  type RequestPrincipal,
  STUB_GRANTED_KEY,
  scopesFor,
} from "./services/authorization/index.ts";

export {
  assertModulesEnabled,
  enabledNavigation,
} from "./lib/entitlement/index.ts";

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
  Module,
  ModuleConfiguration,
  ModuleIdentity,
  ModuleNavigation,
  ModulePages,
  ModuleRequestContext,
  ModuleSchema,
  NavigationEntry,
  PermissionDeclaration,
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
  type AuditEventInput,
  type AuditMetadataValue,
  writeAuditEvent,
} from "./services/audit/index.ts";

export { type GenieOpsOptions, runGenieOps } from "./services/ops/index.ts";

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
} from "./lib/content-security-policy/index.ts";
