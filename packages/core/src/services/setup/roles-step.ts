import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { seedGenieAdministrators, seedRoles } from "../authorization/index.ts";

/**
 * The `roles` step (R-55, R-33). It seeds the two core system roles and every compiled module's
 * default role definitions through `seedRoles`, then seeds the local `Genie Administrators` group
 * holding `Tenant administrator` tenant-wide (R-55, DEC-23). A module registered disabled gets its
 * role definitions only: `seedRoles` appends a module's admin key to `Tenant administrator` only
 * when its entitlement is enabled, so enabling the module later needs no second seeding path.
 *
 * Both halves are create-if-missing and never rewrite an existing permission array, so a rerun or
 * a run that resumes after a failure changes nothing (R-33a).
 */
export async function rolesStep(
  context: TenantContext,
  modules: readonly Pick<Module, "identity" | "permissions" | "defaultRoles">[]
): Promise<void> {
  await seedRoles(context, modules);
  await seedGenieAdministrators(context);
}
