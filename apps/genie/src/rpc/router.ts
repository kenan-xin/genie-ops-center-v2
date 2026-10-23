import {
  createAuditRouter,
  createBrandingRouter,
  createCategoriesRouter,
  createGroupsRouter,
  createModulesRouter,
  createPeopleRouter,
  createRolesRouter,
  createSettingsRouter,
  type Module,
  type ModuleRouter,
} from "@genie/core";

/** The composed router: one entry per module id, plus core's eight areas. */
export type AppRouter = Readonly<Record<string, ModuleRouter>>;

/**
 * Builds one router from keyed entries, and throws on a key that two entries claim (ADR 0011).
 * Module validation already reserves core's area ids, so a duplicate here means a wiring defect,
 * and a later entry must never replace an earlier one in silence.
 */
export function composeRouter(
  entries: readonly (readonly [string, ModuleRouter])[]
): AppRouter {
  const router = new Map<string, ModuleRouter>();

  for (const [key, entry] of entries) {
    if (router.has(key)) {
      throw new Error(
        `The RPC router has two entries under "${key}". Each key must be unique.`
      );
    }

    router.set(key, entry);
  }

  return Object.fromEntries(router);
}

/**
 * The application's router. Each module contributes exactly one entry, keyed by the id its
 * declaration carries, so the RPC path is `/api/rpc/<moduleId>/<procedure>`. Core's own
 * administration areas join them: `audit` behind `core:audit:read` (R-67), `groups` behind
 * `core:groups:manage`, `people` behind `core:people:manage` and `roles` behind
 * `core:roles:manage` (R-37), `modules` and `categories` behind `core:settings:manage` (R-81,
 * R-87). `settings` and `branding` are empty until S3-06 and S3-07 fill them (Section 3, D3-6).
 */
export function createAppRouter(modules: readonly Module[]): AppRouter {
  return composeRouter([
    ...modules.map((module) => [module.identity.id, module.router] as const),
    ["audit", createAuditRouter(modules)],
    ["groups", createGroupsRouter()],
    ["people", createPeopleRouter()],
    ["roles", createRolesRouter(modules)],
    ["modules", createModulesRouter(modules)],
    ["categories", createCategoriesRouter(modules)],
    ["settings", createSettingsRouter(modules)],
    ["branding", createBrandingRouter()],
  ]);
}
