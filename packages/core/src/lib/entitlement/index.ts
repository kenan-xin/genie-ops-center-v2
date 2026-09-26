import type { Module, NavigationEntry } from "../module-contract/module.ts";
import type { EntitlementReader } from "../tenant-context/readers.ts";

/**
 * The R-8 refusal that is a core capability rather than application wiring: hiding a disabled
 * module's navigation. It reads only the entitlement reader, never `can()`, because switching a
 * module off is a deployment decision and not a permission (DEC-39). The tRPC half moved to the
 * per-procedure gate in `module-trpc.ts`, where the module contract's router base lives (d1y).
 */

/**
 * R-8, the navigation half: the declared entries of every compiled module whose entitlement is
 * off leave the tree. The module stays mounted and its routes still exist; only its entries are
 * hidden, so a disabled module stays distinguishable from an excluded one that has no declaration
 * at all.
 *
 * Hiding a link is never an access control: every route and procedure still enforces its own
 * `can()` check (DEC-39).
 */
export async function enabledNavigation(input: {
  readonly entitlements: EntitlementReader;
  readonly modules: readonly Module[];
}): Promise<readonly NavigationEntry[]> {
  const decided = await Promise.all(
    input.modules.map(async (module) => ({
      module,
      enabled: await input.entitlements.isEnabled(module.identity.id),
    }))
  );

  return decided.flatMap(({ module, enabled }) =>
    enabled ? module.navigation.entries : []
  );
}
