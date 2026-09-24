import { AppError, CORE_ERRORS, type TenantContext } from "@genie/core";

type Entitlements = TenantContext["entitlements"];

/** The part of one tRPC call this gate reads: the dotted procedure path. */
type ProcedureCall = {
  readonly path: string;
};

/**
 * R-8, the tRPC half: a compiled module whose entitlement is off refuses its procedures with
 * `module-disabled` rather than answering as unknown. tRPC v11 has no router-level middleware
 * (its FAQ asks and answers "Can I apply a middleware to a full router? No"), and a compiled
 * module's router is built by the module package against its own root, so the application has no
 * seam through which to attach a middleware to that router. This gate therefore runs in the tRPC
 * context factory, the one extension point that sees every procedure call before any resolver,
 * and throws the catalogue error, which the existing formatter renders as HTTP 403 with app code
 * `module-disabled`.
 *
 * The check reads the entitlement reader and never `can()`: entitlement and authorization are
 * separate gates (DEC-39), and this one must not stand in for the module's own permission check.
 *
 * A path whose first segment is not a compiled module id is left alone. The router holds only
 * compiled modules, so an unknown path stays a not-found rather than becoming a disabled module.
 */
export async function assertModulesEnabled(input: {
  readonly entitlements: Entitlements;
  readonly compiledModuleIds: ReadonlySet<string>;
  readonly calls: readonly ProcedureCall[];
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
    throw new AppError(CORE_ERRORS["module-disabled"]);
  }
}
