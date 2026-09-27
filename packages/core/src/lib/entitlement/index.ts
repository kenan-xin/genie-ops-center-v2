import { can } from "../../services/authorization/index.ts";
import type { RequestPrincipal } from "../../services/authorization/principal.ts";
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

/**
 * R-34, the permission half beside the entitlement half: an entry of an included, entitled module
 * stays only when `can()` grants its required permission, through the request's one loader. A
 * module whose entries all go contributes nothing. Hiding is never the enforcement: the route
 * behind an omitted entry still refuses in its own `can()` check (R-35).
 */
export async function permittedNavigation(input: {
  readonly entitlements: EntitlementReader;
  readonly modules: readonly Module[];
  readonly caller: RequestPrincipal;
}): Promise<readonly NavigationEntry[]> {
  const entries = await enabledNavigation(input);

  const allowed = await Promise.all(
    entries.map((entry) => can(input.caller, entry.requiredPermission))
  );

  return entries.filter((_, index) => allowed[index] === true);
}

/**
 * Where a person goes after sign-in (R-36, DEC-49): the landing entry's path when it survived
 * `permittedNavigation`, otherwise undefined, and the shell shows the no-grants empty state.
 */
export function landingRoute(
  permitted: readonly NavigationEntry[]
): string | undefined {
  return permitted.find(
    (entry) => entry.surface === "workspace" && entry.landing === true
  )?.path;
}
