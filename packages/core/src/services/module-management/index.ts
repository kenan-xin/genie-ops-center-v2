import { and, eq } from "drizzle-orm";

import type { Module } from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { withTransaction } from "../../lib/tenant-context/with-transaction.ts";
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
  | "module-not-registered"
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

/**
 * What one call changed (DEC-23). `changed` is false when the module already held the requested
 * state, so a caller knows whether this call was the enable/disable transition — and only a true
 * transition moves `enabled_at`.
 */
export type ModuleEnableResult = { readonly changed: boolean };

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
 * the image carries, and an id with no `tenant_module` row, because only the seed step and the
 * migrator run register module rows (R-20, DEC-50): a command must not invent one. The row is read
 * with `FOR UPDATE` and written in the same transaction, so a concurrent configuration save cannot
 * slip between the validation and the write.
 *
 * On a real enable it validates the row's stored `tenant_module.config` against the module's
 * declared configuration schema (R-68a): a missing or invalid required value refuses the enable
 * with actionable issues and leaves the row untouched. Disable validates nothing, so a module
 * whose configuration no longer parses can still be switched off. A repeated enable or disable is a
 * no-op that keeps `enabled_at`; `changed` reports whether this call was the transition.
 */
export async function setModuleEnabled(
  context: TenantContext,
  compiledModules: readonly Module[],
  moduleId: string,
  enabled: boolean
): Promise<ModuleEnableResult> {
  const module = compiledModules.find(
    (candidate) => candidate.identity.id === moduleId
  );

  if (module === undefined) {
    throw new ModuleManagementError(
      "module-not-compiled",
      `module-not-compiled: ${moduleId} is not compiled into this image`
    );
  }

  return withTransaction(context, async (tx) => {
    const rows = await tx
      .select({ enabled: tenantModule.enabled, config: tenantModule.config })
      .from(tenantModule)
      .where(eq(tenantModule.moduleId, moduleId))
      .for("update");

    const row = rows[0];

    if (row === undefined) {
      throw new ModuleManagementError(
        "module-not-registered",
        `module-not-registered: ${moduleId} has no tenant_module row; run \`genie-ops setup\` or \`genie-ops migrate\` first`
      );
    }

    const configuration = module.configuration;

    if (enabled && !row.enabled && configuration !== undefined) {
      // The row's jsonb is unparsed input; this schema run is its boundary, and it is the only
      // place the stored config is trusted (R-68a). It runs only on a real disable-to-enable
      // transition, so a repeated enable never refuses a module that is already active.
      const result = configuration.schema.safeParse(row.config ?? {});

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

    // The condition is the transition itself (`enabled = false` to enable, `enabled = true` to
    // disable), so a repeated call matches no row and changes nothing, and `enabled_at` moves only
    // on a real enable.
    const updated = await tx
      .update(tenantModule)
      .set(
        enabled ? { enabled: true, enabledAt: new Date() } : { enabled: false }
      )
      .where(
        and(
          eq(tenantModule.moduleId, moduleId),
          eq(tenantModule.enabled, !enabled)
        )
      )
      .returning({ moduleId: tenantModule.moduleId });

    return { changed: updated.length > 0 };
  });
}
