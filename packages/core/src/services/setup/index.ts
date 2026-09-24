import { ne } from "drizzle-orm";

import { foregroundFor } from "../../lib/branding/foreground.ts";
import type {
  BrandingSeed,
  TenantYaml,
} from "../../lib/tenant-config/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import {
  setupStep,
  tenantBranding,
  tenantModule,
  tenantSettings,
} from "../../schema.ts";
import { rootCauseMessage } from "../../utils/error-cause.ts";
import {
  type MigrationHistory,
  type MigrationLog,
  migrationPlan,
  runMigrations,
} from "../migrator/index.ts";
import {
  type SetupConfigFiles,
  loadBrandingSeed,
  loadTenantYaml,
} from "./config.ts";

/**
 * What the `setup` command reads. It is the runner's own options minus the environment, which the
 * runner has already turned into the context this command receives.
 */
export type SetupOptions = {
  /** The module ids the image compiled, written as the initial `tenant_module` rows (R-20). */
  readonly compiledModuleIds: readonly string[];
  /** The module histories only; the migrator run prepends core's own (R-25). */
  readonly histories: readonly MigrationHistory[];
  readonly output: (line: string) => void;
  readonly errorOutput: (line: string) => void;
};

/** The steps this section knows, in the run order the `setup_step` table records (R-14, R-18). */
const SETUP_STEPS = ["migrations", "seed"] as const;

type SetupStep = (typeof SETUP_STEPS)[number];

type SetupStepState = "pending" | "done" | "failed";

/** The two states a step settles on; `pending` is the transient one it leaves. */
type SettledStepState = "done" | "failed";

/** True once the migration that creates `setup_step` has run. */
async function setupStepTableExists(context: TenantContext): Promise<boolean> {
  const result = await context.db.$client.query<{ present: boolean }>(
    "select to_regclass('setup_step') is not null as present"
  );

  return result.rows[0]?.present === true;
}

/**
 * The recorded state of one step, or nothing when the table or the row does not exist yet. The
 * `migrations` step runs before the table exists, so a missing table reads as no state.
 */
async function stepState(
  context: TenantContext,
  step: SetupStep
): Promise<SetupStepState | undefined> {
  if (!(await setupStepTableExists(context))) return undefined;

  const result = await context.db.$client.query<{ state: SetupStepState }>(
    "select state from setup_step where step = $1",
    [step]
  );

  return result.rows[0]?.state;
}

/**
 * Writes or moves one step's row. `updated_at` advances, which is what orders the run (R-18).
 */
async function writeStep(
  context: TenantContext,
  step: SetupStep,
  state: SettledStepState,
  detail: string | null
): Promise<void> {
  await context.db
    .insert(setupStep)
    .values({ step, state, detail })
    .onConflictDoUpdate({
      target: setupStep.step,
      set: { state, detail, updatedAt: new Date() },
    });
}

/**
 * Moves a step to `pending` before its work, but never over a step that is already `done`. The
 * update carries its own `WHERE` so the database, not the earlier read, decides: two concurrent
 * setup runs cannot flip a finished step back to `pending` (R-18). The read that skips a done
 * step stays as the ordinary fast path.
 */
async function markPending(
  context: TenantContext,
  step: SetupStep
): Promise<void> {
  await context.db
    .insert(setupStep)
    .values({ step, state: "pending", detail: null })
    .onConflictDoUpdate({
      target: setupStep.step,
      set: { state: "pending", detail: null, updatedAt: new Date() },
      setWhere: ne(setupStep.state, "done"),
    });
}

/** The `migrations` step: the migrator run of R-9/R-19 and nothing else. */
async function migrationsStep(
  context: TenantContext,
  options: SetupOptions,
  log: MigrationLog
): Promise<void> {
  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan(options.histories),
    compiledModuleIds: options.compiledModuleIds,
    log,
  });
}

/**
 * The single `tenant_settings` row: a value the file omits is left out of the statement, so the
 * column default applies and no default lives in two places (R-78).
 */
function settingsRow(tenant: TenantYaml): typeof tenantSettings.$inferInsert {
  const settings: typeof tenantSettings.$inferInsert = {
    updatedByUserId: null,
  };

  if (tenant.onboarding_mode !== undefined) {
    settings.onboardingMode = tenant.onboarding_mode;
  }

  if (tenant.local_accounts !== undefined) {
    settings.localAccountsEnabled = tenant.local_accounts;
  }

  return settings;
}

/**
 * The branding columns a seed file authors, copied as they are. An omitted value becomes null in
 * the nullable columns, so nothing is invented for it (R-78).
 */
function brandingIdentity(
  branding: BrandingSeed
): Partial<typeof tenantBranding.$inferInsert> {
  return {
    updatedByUserId: null,
    logoLightFileId: branding.logo_light_file_id ?? null,
    logoDarkFileId: branding.logo_dark_file_id ?? null,
    logoMarkFileId: branding.logo_mark_file_id ?? null,
    faviconFileId: branding.favicon_file_id ?? null,
    textColor: branding.text_color ?? null,
    loginBackgroundFileId: branding.login_background_file_id ?? null,
    loginBackgroundColor: branding.login_background_color ?? null,
    loginWelcomeText: branding.login_welcome_text ?? null,
    loginNoticeText: branding.login_notice_text ?? null,
    emailSenderName: branding.email_sender_name ?? null,
    emailReplyTo: branding.email_reply_to ?? null,
    emailFooterText: branding.email_footer_text ?? null,
    supportUrl: branding.support_url ?? null,
    supportEmail: branding.support_email ?? null,
    termsUrl: branding.terms_url ?? null,
    privacyUrl: branding.privacy_url ?? null,
    dateFormat: branding.date_format ?? null,
    numberFormat: branding.number_format ?? null,
  };
}

/**
 * The branding appearance columns, including the derived `primary_foreground` (DEC-47). A column
 * the file omits stays unset so its own default applies (R-78).
 */
function brandingAppearance(
  branding: BrandingSeed
): Partial<typeof tenantBranding.$inferInsert> {
  const appearance: Partial<typeof tenantBranding.$inferInsert> = {
    primaryColor: branding.primary_color ?? null,
    primaryForeground:
      branding.primary_color === undefined
        ? null
        : foregroundFor(branding.primary_color),
  };

  if (branding.default_theme !== undefined) {
    appearance.defaultTheme = branding.default_theme;
  }

  if (branding.font_family !== undefined) {
    appearance.fontFamily = branding.font_family;
  }

  if (branding.font_size !== undefined) {
    appearance.fontSize = branding.font_size;
  }

  if (branding.login_notice_requires_acknowledgement !== undefined) {
    appearance.loginNoticeRequiresAcknowledgement =
      branding.login_notice_requires_acknowledgement;
  }

  return appearance;
}

/**
 * The `seed` step (R-20): one `tenant_module` row per compiled module, the single
 * `tenant_settings` row from `tenant.yaml` and the single `tenant_branding` row from
 * `branding.seed.json`, in one transaction so a failure leaves no partial seed (R-77).
 */
async function seedStep(
  context: TenantContext,
  files: SetupConfigFiles,
  options: SetupOptions
): Promise<void> {
  const tenant = await loadTenantYaml(files.tenantConfig);
  const branding = await loadBrandingSeed(files.brandingSeed);

  await context.db.transaction(async (tx) => {
    if (options.compiledModuleIds.length > 0) {
      await tx
        .insert(tenantModule)
        .values(
          options.compiledModuleIds.map((moduleId) => ({
            moduleId,
            enabled: true,
          }))
        )
        .onConflictDoNothing();
    }

    await tx
      .insert(tenantSettings)
      .values(settingsRow(tenant))
      .onConflictDoNothing();

    await tx
      .insert(tenantBranding)
      .values({
        companyName: branding.company_name,
        productName: branding.product_name,
        defaultLocale: branding.default_locale,
        defaultTimeZone: branding.default_time_zone,
        ...brandingIdentity(branding),
        ...brandingAppearance(branding),
      })
      .onConflictDoNothing();
  });
}

/** The work of one step, so the runner below is the only place that records state. */
async function stepWork(
  step: SetupStep,
  context: TenantContext,
  files: SetupConfigFiles,
  options: SetupOptions,
  log: MigrationLog
): Promise<void> {
  switch (step) {
    case "migrations":
      return migrationsStep(context, options, log);

    case "seed":
      return seedStep(context, files, options);
  }
}

/** Records a failed step's cause. A row that cannot be written never replaces the step failure. */
async function recordFailure(
  context: TenantContext,
  step: SetupStep,
  cause: Error | undefined
): Promise<void> {
  try {
    await writeStep(context, step, "failed", rootCauseMessage(cause));
  } catch {
    // The step's own failure is the one the run reports; a row that cannot be written falls back
    // to the command output (R-65) and never replaces that cause.
  }
}

/**
 * Runs one step and records its state outside the step's own transaction (R-77, R-18): the row
 * moves to `pending` before the work, to `done` after it, and to `failed` with the cause when it
 * throws, so a later run starts again at that step. The `migrations` step creates `setup_step`,
 * so before that table exists there is no row to write and the command output is the only sink.
 */
async function runStep(
  context: TenantContext,
  step: SetupStep,
  work: () => Promise<void>
): Promise<void> {
  const rowWritable = await setupStepTableExists(context);

  if (rowWritable) await markPending(context, step);

  try {
    await work();
  } catch (caught) {
    if (rowWritable) {
      await recordFailure(
        context,
        step,
        caught instanceof Error ? caught : undefined
      );
    }

    throw caught;
  }

  await writeStep(context, step, "done", null);
}

/**
 * The resumable `genie-ops setup` (R-18): each step this section knows runs in order, a step
 * already `done` is skipped so a rerun never moves it back and never overwrites seeded rows, and
 * a `failed` step runs again. The runner owns the context and closes its pool; this function
 * writes nothing outside the context.
 */
export async function runSetup(
  context: TenantContext,
  files: SetupConfigFiles,
  options: SetupOptions,
  log: MigrationLog
): Promise<void> {
  for (const step of SETUP_STEPS) {
    // The steps run in their recorded order, each starting only once the one before it is done,
    // so the reads and the step work are sequential on purpose (R-18).
    // oxlint-disable-next-line no-await-in-loop
    if ((await stepState(context, step)) === "done") continue;

    // oxlint-disable-next-line no-await-in-loop
    await runStep(context, step, () =>
      stepWork(step, context, files, options, log)
    );
  }
}
