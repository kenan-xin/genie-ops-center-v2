import type { Module, TenantContext } from "@genie/core";
import type { NavigationItem } from "@genie/ui";

/**
 * R-8, the navigation half: hide a compiled module whose entitlement is off. The module stays
 * mounted and its route still exists; only its entries leave the tree, so refusing and not
 * existing stay distinguishable (an excluded module has no declaration here at all).
 *
 * Hiding a link is never an access control: every route and procedure still enforces its own
 * `can()` check (DEC-39). This reads the entitlement reader, never `can()`, because switching a
 * module off is a deployment decision, not a permission.
 */
export async function enabledNavigation(input: {
  readonly entitlements: TenantContext["entitlements"];
  readonly modules: readonly Module[];
}): Promise<readonly NavigationItem[]> {
  const decided = await Promise.all(
    input.modules.map(async (module) => ({
      module,
      enabled: await input.entitlements.isEnabled(module.identity.id),
    }))
  );

  return decided.flatMap(({ module, enabled }) =>
    enabled
      ? module.navigation.entries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          path: entry.path,
        }))
      : []
  );
}
