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

export {
  validateModule,
  validateRegistry,
} from "./lib/module-contract/validate.ts";
