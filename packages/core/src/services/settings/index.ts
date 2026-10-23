import type {
  ConfigFormField,
  ConfigFormSchema,
  ConfigValue,
} from "@genie/ui/config-form-schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { isEqual } from "es-toolkit";
import type { z } from "zod";

import {
  AppError,
  type AppErrorIssue,
  CORE_ERRORS,
} from "../../lib/errors/index.ts";
import {
  configurationForm,
  configurationIssues,
  storedConfiguration,
  withDefaults,
} from "../../lib/module-contract/configuration-form.ts";
import {
  type Module,
  type ModuleConfiguration,
  SETTINGS_BASE_PERMISSION,
} from "../../lib/module-contract/module.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  type TenantTransaction,
  withTransaction,
} from "../../lib/tenant-context/with-transaction.ts";
import {
  auditEvent,
  tenantModule,
  tenantSettings,
  user,
} from "../../schema.ts";
import {
  type AuditMetadataValue,
  writeAdminAuditEvent,
} from "../audit/index.ts";
import { can } from "../authorization/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { ModuleManagementError } from "../module-management/index.ts";
import { sessionSettingsSchema, signInSettingsSchema } from "./schemas.ts";

/** Who changed a section last, and when. `by` is null for a write no person made (provisioning). */
export type LastChanged = {
  readonly by: string | null;
  readonly at: string;
} | null;

export type CoreSettingsView = {
  readonly onboardingMode: "invite" | "jit";
  readonly localAccountsEnabled: boolean;
  readonly realmSupportsLocalAccounts: boolean;
  readonly sessionIdleMinutes: number;
  readonly lastChanged: LastChanged;
};

export type ModuleSettingsView = {
  readonly moduleId: string;
  readonly title: string;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly schema: ConfigFormSchema;
  readonly fields: readonly ConfigFormField[];
  readonly values: Record<string, ConfigValue>;
  readonly lastChanged: LastChanged;
};

export type SettingsView = {
  readonly core: CoreSettingsView;
  readonly modules: readonly ModuleSettingsView[];
};

/** A section opens only with the base key AND its own key, when it declares one (module contract). */
async function maySeeSection(
  caller: RequestPrincipal,
  configuration: ModuleConfiguration
): Promise<boolean> {
  if (!(await can(caller, SETTINGS_BASE_PERMISSION))) return false;

  const extra = configuration.section.additionalPermission;

  return extra === undefined || can(caller, extra);
}

function issuesOf(error: z.ZodError): readonly AppErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function lastChangedOf(at: Date | null, by: string | null): LastChanged {
  return at === null ? null : { by, at: at.toISOString() };
}

async function readCore(tenant: TenantContext): Promise<CoreSettingsView> {
  const [row] = await tenant.db
    .select({
      onboardingMode: tenantSettings.onboardingMode,
      localAccountsEnabled: tenantSettings.localAccountsEnabled,
      realmSupportsLocalAccounts: tenantSettings.realmSupportsLocalAccounts,
      sessionIdleMinutes: tenantSettings.sessionIdleMinutes,
      updatedAt: tenantSettings.updatedAt,
      updatedBy: user.name,
    })
    .from(tenantSettings)
    .leftJoin(user, eq(user.id, tenantSettings.updatedByUserId));

  if (row === undefined) throw new Error("tenant_settings holds no row");

  return {
    onboardingMode: row.onboardingMode === "jit" ? "jit" : "invite",
    localAccountsEnabled: row.localAccountsEnabled,
    realmSupportsLocalAccounts: row.realmSupportsLocalAccounts,
    sessionIdleMinutes: row.sessionIdleMinutes,
    lastChanged: lastChangedOf(row.updatedAt, row.updatedBy),
  };
}

/**
 * The page read (R-72, R-75). It reads the database, not the 10-second cached readers, so a save
 * shows at once (DEC-46). Sections come in compiled order, only for modules that declare
 * configuration and whose section the caller may open; a disabled module stays listed (R-77).
 */
export async function readSettings(
  tenant: TenantContext,
  compiled: readonly Module[],
  caller: RequestPrincipal
): Promise<SettingsView> {
  const core = await readCore(tenant);

  const candidates = await Promise.all(
    compiled.map(async (module) => {
      const { configuration } = module;

      return configuration !== undefined &&
        (await maySeeSection(caller, configuration))
        ? [{ module, configuration }]
        : [];
    })
  );

  const visible = candidates.flat();

  if (visible.length === 0) return { core, modules: [] };

  const ids = visible.map(({ module }) => module.identity.id);

  const rows = await tenant.db
    .select({
      moduleId: tenantModule.moduleId,
      enabled: tenantModule.enabled,
      config: tenantModule.config,
    })
    .from(tenantModule)
    .where(inArray(tenantModule.moduleId, ids));

  // tenant_module records no author, so the newest `core:module_configured` row names one (D3-6).
  const changes = await tenant.db
    .selectDistinctOn([auditEvent.targetId], {
      moduleId: auditEvent.targetId,
      at: auditEvent.occurredAt,
      by: user.name,
    })
    .from(auditEvent)
    .leftJoin(user, eq(user.id, auditEvent.actorUserId))
    .where(
      and(
        eq(auditEvent.action, "core:module_configured"),
        inArray(auditEvent.targetId, ids)
      )
    )
    .orderBy(
      auditEvent.targetId,
      desc(auditEvent.occurredAt),
      desc(auditEvent.id)
    );

  const rowById = new Map(rows.map((row) => [row.moduleId, row]));

  const changeById = new Map(
    changes.map((change) => [change.moduleId, change])
  );

  const modules = visible.map(
    ({ module, configuration }): ModuleSettingsView => {
      const id = module.identity.id;
      const form = configurationForm(configuration);
      const row = rowById.get(id);
      const change = changeById.get(id);

      return {
        moduleId: id,
        title: configuration.section.title,
        description: configuration.section.description ?? null,
        enabled: row?.enabled ?? false,
        schema: form.schema,
        fields: form.fields,
        values: withDefaults(
          form,
          storedConfiguration.parse(row?.config ?? {})
        ),
        lastChanged: lastChangedOf(change?.at ?? null, change?.by ?? null),
      };
    }
  );

  return { core, modules };
}

type SettingsField =
  | "onboardingMode"
  | "localAccountsEnabled"
  | "sessionIdleMinutes";

type CoreSection = {
  readonly id: "sign-in" | "sessions";
  readonly title: string;
};

/**
 * Writes the changed core fields on the locked singleton row with one `core:settings_updated` row,
 * in one transaction (R-79, R-90a). Values equal to the stored ones write nothing.
 */
async function saveCore(
  tenant: TenantContext,
  section: CoreSection,
  actorUserId: string,
  next: Partial<Pick<typeof tenantSettings.$inferInsert, SettingsField>>,
  refuse: (row: typeof tenantSettings.$inferSelect) => void
): Promise<{ readonly changed: boolean }> {
  return withTransaction(tenant, async (tx: TenantTransaction) => {
    const [row] = await tx.select().from(tenantSettings).for("update");

    if (row === undefined) throw new Error("tenant_settings holds no row");

    refuse(row);

    const changes: Record<string, AuditMetadataValue> = {};

    // SAFETY: `next` is typed as a pick of SettingsField columns, so its own keys are those names.
    for (const field of Object.keys(next) as SettingsField[]) {
      const from = row[field];
      const to = next[field];

      if (to !== undefined && from !== to) changes[field] = { from, to };
    }

    if (Object.keys(changes).length === 0) return { changed: false };

    await tx
      .update(tenantSettings)
      .set({ ...next, updatedByUserId: actorUserId, updatedAt: sql`now()` });

    await writeAdminAuditEvent(tx, {
      action: "core:settings_updated",
      actorUserId,
      targetType: "settings",
      targetId: section.id,
      summary: `Changed ${section.title}`,
      metadata: { section: section.id, changes },
    });

    return { changed: true };
  });
}

/** Onboarding mode and local accounts (R-74). The page never writes `realm_supports_local_accounts`. */
export async function saveSignInSettings(
  tenant: TenantContext,
  input: {
    readonly actorUserId: string;
    readonly onboardingMode: string;
    readonly localAccountsEnabled: boolean;
  }
): Promise<{ readonly changed: boolean }> {
  const parsed = signInSettingsSchema.safeParse(input);

  if (!parsed.success)
    throw new AppError(CORE_ERRORS["settings-invalid"], {
      issues: issuesOf(parsed.error),
    });

  return saveCore(
    tenant,
    { id: "sign-in", title: "Sign-in & accounts" },
    input.actorUserId,
    parsed.data,
    (row) => {
      // Turning local accounts on needs a realm that holds them; leaving them as stored never refuses.
      if (
        parsed.data.localAccountsEnabled &&
        !row.localAccountsEnabled &&
        !row.realmSupportsLocalAccounts
      )
        throw new AppError(CORE_ERRORS["local-accounts-unavailable"]);
    }
  );
}

/** The idle timeout (R-73). Sessions pick it up through the settings reader within 10 seconds. */
export async function saveSessionSettings(
  tenant: TenantContext,
  input: { readonly actorUserId: string; readonly sessionIdleMinutes: number }
): Promise<{ readonly changed: boolean }> {
  const parsed = sessionSettingsSchema.safeParse(input);

  if (!parsed.success)
    throw new AppError(CORE_ERRORS["settings-invalid"], {
      issues: issuesOf(parsed.error),
    });

  return saveCore(
    tenant,
    { id: "sessions", title: "Sessions" },
    input.actorUserId,
    parsed.data,
    () => {}
  );
}

/**
 * A module section save (R-75, R-77, R-79). It validates with the module's own zod schema and
 * writes `tenant_module.config` only: it never writes `enabled`, so a save alone never switches a
 * module on. A section the caller may not open, a module without configuration and a module the
 * image does not compile all answer `not-found`, so no hidden section is disclosed.
 */
export async function saveModuleSettings(
  tenant: TenantContext,
  compiled: readonly Module[],
  caller: RequestPrincipal,
  input: {
    readonly actorUserId: string;
    readonly moduleId: string;
    readonly values: Readonly<Record<string, ConfigValue>>;
  }
): Promise<{ readonly changed: boolean }> {
  const module = compiled.find(
    (candidate) => candidate.identity.id === input.moduleId
  );

  const configuration = module?.configuration;

  if (
    module === undefined ||
    configuration === undefined ||
    !(await maySeeSection(caller, configuration))
  )
    throw new AppError(CORE_ERRORS["not-found"]);

  const form = configurationForm(configuration);
  const parsed = configuration.schema.safeParse(input.values);

  if (!parsed.success) {
    const issues = configurationIssues(form, input.values);

    throw new AppError(CORE_ERRORS["settings-invalid"], {
      issues: issues.length === 0 ? issuesOf(parsed.error) : issues,
    });
  }

  const next = storedConfiguration.parse(parsed.data);

  return withTransaction(tenant, async (tx) => {
    // The same row lock as the enable procedure, so a concurrent enable waits for this write.
    const [row] = await tx
      .select({ config: tenantModule.config })
      .from(tenantModule)
      .where(eq(tenantModule.moduleId, input.moduleId))
      .for("update");

    if (row === undefined) {
      throw new ModuleManagementError(
        "module-not-registered",
        `module-not-registered: ${input.moduleId} has no tenant_module row`
      );
    }

    const shown = withDefaults(form, storedConfiguration.parse(row.config));

    const changedFields = form.fields
      .map((field) => field.id)
      .filter((id) => !isEqual(shown[id], next[id]));

    if (changedFields.length === 0) return { changed: false };

    await tx
      .update(tenantModule)
      .set({ config: next })
      .where(eq(tenantModule.moduleId, input.moduleId));

    // Only the field names: module values may hold business data (R-90a).
    await writeAdminAuditEvent(tx, {
      action: "core:module_configured",
      actorUserId: input.actorUserId,
      targetType: "module",
      targetId: input.moduleId,
      summary: `Changed the ${module.identity.displayName} settings`,
      metadata: { changedFields },
    });

    return { changed: true };
  });
}
