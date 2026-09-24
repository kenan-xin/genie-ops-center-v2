import { AppError, CORE_ERRORS } from "../errors/index.ts";
import type { Module, NavigationEntry } from "../module-contract/module.ts";
import type { EntitlementReader } from "../tenant-context/readers.ts";

/**
 * The two R-8 refusals that are core capabilities rather than application wiring: refusing a tRPC
 * call to a disabled module, and hiding a disabled module's navigation. Both read only the
 * entitlement reader, never `can()`, because switching a module off is a deployment decision and
 * not a permission (DEC-39). A custom application composes these the same way `apps/genie` does.
 */

/** The part of one tRPC call this gate reads: the dotted procedure path. */
type ProcedureCall = {
  readonly path: string;
};

/**
 * R-8, the tRPC half: a compiled module whose entitlement is off refuses its procedures with
 * `module-disabled` rather than answering as unknown. tRPC v11 has no router-level middleware (its
 * FAQ asks and answers "Can I apply a middleware to a full router? No"), and a compiled module's
 * router is built by the module package against its own root, so the application calls this from
 * its tRPC context factory, the one extension point that sees a procedure call before any
 * resolver. The thrown error is a catalogue `AppError` that carries the request id, so a formatter
 * that runs without a context still correlates the body with the log line (R-46, AC-15).
 *
 * A path whose first segment is not a compiled module id is left alone. tRPC resolves the calls
 * before the context factory runs, but a path with no procedure still reaches the factory here,
 * and an unknown path must stay a not-found rather than become a disabled module.
 *
 * ponytail: one refusal covers the whole batch, so a batch that mixes a disabled module with an
 * enabled one refuses both. That fails closed and never under-refuses; per-call refusal needs a
 * core procedure base in the module contract (genie-ops-center-v2-d1y).
 */
export async function assertModulesEnabled(input: {
  readonly entitlements: EntitlementReader;
  readonly compiledModuleIds: ReadonlySet<string>;
  readonly calls: readonly ProcedureCall[];
  readonly requestId: string;
}): Promise<void> {
  const asked = input.calls.flatMap((call) => {
    const moduleId = call.path.split(".")[0];

    return moduleId !== undefined && input.compiledModuleIds.has(moduleId)
      ? [moduleId]
      : [];
  });

  const enabled = await Promise.all(
    asked.map((moduleId) => input.entitlements.isEnabled(moduleId))
  );

  if (enabled.includes(false)) {
    throw new AppError(CORE_ERRORS["module-disabled"], {
      requestId: input.requestId,
    });
  }
}

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
