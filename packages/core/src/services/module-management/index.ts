import { eq } from "drizzle-orm";

import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { tenantModule } from "../../schema.ts";

/**
 * One actionable validation failure of R-68a: the configuration field a person has to fix
 * (`path`) and the message the schema gives for it. It is what a caller renders beside the field.
 */
export type ModuleConfigIssue = {
  readonly path: string;
  readonly message: string;
};

/** The stable refusal codes of the one enable/disable procedure. */
export type ModuleManagementErrorCode =
  | "module-not-compiled"
  | "module-config-invalid";

/**
 * The refusal the enable/disable procedure raises. A plain `Error` cannot carry a stable code
 * and a dynamic, actionable message at once; this one carries both, and the enable path attaches
 * one `issues` entry per invalid field so the command line and the Modules screen of Section 3
 * show the same detail (R-68, R-68a).
 */
export class ModuleManagementError extends Error {
  readonly code: ModuleManagementErrorCode;

  readonly issues: readonly ModuleConfigIssue[];

  constructor(
    code: ModuleManagementErrorCode,
    message: string,
    issues: readonly ModuleConfigIssue[] = []
  ) {
    super(message);
    this.name = "ModuleManagementError";
    this.code = code;
    this.issues = issues;
  }
}

/** One issue as the single line the operator reads: `endpoint: Invalid url`. */
function describeIssue(issue: ModuleConfigIssue): string {
  return issue.path === "" ? issue.message : `${issue.path}: ${issue.message}`;
}

/**
 * The one procedure that switches a compiled module on or off (R-68, DEC-50). The `genie-ops
 * module enable|disable` command and the Modules page of Section 3 both call this, so the two
 * cannot diverge; it takes the compiled module definitions the image carries, not a second copy of
 * their ids (D-12).
 *
 * It refuses an id the image did not compile, because an entitlement can only switch on a module
 * the image carries. On enable it validates the row's stored `tenant_module.config` against the
 * module's declared configuration schema (R-68a): a missing or invalid required value refuses the
 * enable with actionable issues and leaves the row untouched, so the module stays disabled and
 * `enabled_at` does not move. Disable validates nothing, so a module whose configuration no longer
 * parses can still be switched off. A module without required configuration still needs this
 * explicit enable; valid configuration alone never activates it.
 */
export async function setModuleEnabled(
  context: TenantContext,
  compiledModules: readonly Module[],
  moduleId: string,
  enabled: boolean
): Promise<void> {
  const module = compiledModules.find(
    (candidate) => candidate.identity.id === moduleId
  );

  if (module === undefined) {
    throw new ModuleManagementError(
      "module-not-compiled",
      `module-not-compiled: ${moduleId} is not compiled into this image`
    );
  }

  const configuration = module.configuration;

  if (enabled && configuration !== undefined) {
    const current = await context.db
      .select({ config: tenantModule.config })
      .from(tenantModule)
      .where(eq(tenantModule.moduleId, moduleId));

    // The row's jsonb is unparsed input; this schema run is its boundary, and it is the only
    // place the stored config is trusted (R-68a).
    const result = configuration.schema.safeParse(current[0]?.config ?? {});

    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      throw new ModuleManagementError(
        "module-config-invalid",
        `module-config-invalid: ${moduleId} ${issues.map(describeIssue).join("; ")}`,
        issues
      );
    }
  }

  const enabledAt = new Date();

  const updated = await context.db
    .update(tenantModule)
    .set(enabled ? { enabled: true, enabledAt } : { enabled: false })
    .where(eq(tenantModule.moduleId, moduleId))
    .returning({ moduleId: tenantModule.moduleId });

  if (updated.length === 0 && enabled) {
    // A compiled module with no row yet — an image upgraded outside the migrator's registration —
    // still activates rather than silently doing nothing. `enable` only falsifies here; a disable
    // of a missing row has nothing to switch off.
    await context.db
      .insert(tenantModule)
      .values({ moduleId, enabled: true, enabledAt })
      .onConflictDoNothing();
  }
}
