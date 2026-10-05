import { ne, sql } from "drizzle-orm";

import { foregroundFor } from "../../lib/branding/foreground.ts";
import type { EnvironmentSource } from "../../lib/environment/index.ts";
import type { Module } from "../../lib/module-contract/module.ts";
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
import { clientsStep } from "../keycloak/clients-step.ts";
import { realmStep } from "../keycloak/realm-step.ts";
import {
  type MigrationHistory,
  type MigrationLog,
  migrationPlan,
  runMigrations,
} from "../migrator/index.ts";
import { adminSeedStep } from "./admin-seed-step.ts";
import { breakGlassStep } from "./break-glass-step.ts";
import {
  type SetupConfigFiles,
  loadBrandingSeed,
  loadTenantYaml,
} from "./config.ts";
import { rolesStep } from "./roles-step.ts";

/**
 * What the `setup` command reads. It is the runner's own options minus the environment, which the
 * runner has already turned into the context this command receives.
 */
export type SetupOptions = {
  /**
   * The modules the image compiled. The seed step derives the initial `tenant_module` rows from
   * them (R-20), the migrator run derives the compiled ids it checks and registers (R-79), and the
   * `roles` step seeds each module's default roles (R-55). One list reaches every reader, so
   * nothing holds a second copy and the readers cannot disagree (D-12).
   */
  readonly compiledModules: readonly Module[];
  /** The module histories only; the migrator run prepends core's own (R-25). */
  readonly histories: readonly MigrationHistory[];
  /** The raw environment, for the Section 2 values the realm and clients steps read at step time. */
  readonly source: EnvironmentSource;
  readonly output: (line: string) => void;
  readonly errorOutput: (line: string) => void;
};

/** The steps this section knows, in the run order the `setup_step` table records (R-14, R-18, R-17b). */
export const SETUP_STEPS = [
  "migrations",
  "seed",
  "realm",
  "clients",
  "roles",
  "admin_seed",
  "break_glass",
] as const;

type SetupStep = (typeof SETUP_STEPS)[number];

/**
 * The recorded state of a known step. `pending` is both the transient write and the missing row.
 * `skipped` is a settled state only the `realm` and `clients` steps take in client-only mode
 * (R-54a): the realm and the clients live in the customer's own realm, so setup creates neither.
 */
export type SetupStepState = "pending" | "done" | "failed" | "skipped";

/** One known step as the setup gate and the not-set-up page read it (R-14, R-16). */
export type SetupStepView = {
  readonly step: string;
  readonly state: SetupStepState;
  readonly detail: string | null;
};

/** The states a step settles on; `pending` is the transient one it leaves. */
type SettledStepState = "done" | "failed" | "skipped";

/** What one step's work answers: it completed, or it is settled as `skipped` (R-54a). */
type StepOutcome = "done" | "skipped";

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
 * True when a step must not run again. Every step settles as `done`; the `realm` and `clients`
 * steps may also settle as `skipped` in client-only mode, because the customer owns the realm
 * (R-54a). A missing row and a `failed` or `pending` row all run again.
 */
function stepSettled(
  step: SetupStep,
  state: SetupStepState | undefined
): boolean {
  if (state === "done") return true;

  return (step === "realm" || step === "clients") && state === "skipped";
}

/**
 * The address the `clients` step recorded, or null while it has not (R-54c). A stack whose steps
 * are all settled while the column is null gets it written by its next setup run, so this is the
 * one read that decides that repair.
 */
async function keycloakUrlAtSetup(
  context: TenantContext
): Promise<string | null> {
  const [row] = await context.db
    .select({ url: tenantSettings.keycloakUrlAtSetup })
    .from(tenantSettings)
    .limit(1);

  return row?.url ?? null;
}

/**
 * The progress of every step this image knows (R-14, R-15), for the setup gate and the
 * not-set-up page. A missing row is a `pending` step; a missing table or any other query failure
 * throws, because the application only reaches this after the `migrations` step created
 * `setup_step`, so a throw is the outage or corruption the caller answers with a generic 503.
 * It reads the table directly and caches nothing, because a stale answer would leave a set-up
 * deployment showing the not-set-up page (R-15).
 */
export async function readSetupProgress(
  context: TenantContext
): Promise<readonly SetupStepView[]> {
  const result = await context.db.$client.query<{
    step: string;
    state: SetupStepState;
    detail: string | null;
  }>("select step, state, detail from setup_step");

  const byStep = new Map(result.rows.map((row) => [row.step, row] as const));

  return SETUP_STEPS.map((step) => {
    const row = byStep.get(step);

    return {
      step,
      state: row?.state ?? "pending",
      detail: row?.detail ?? null,
    };
  });
}

/**
 * True when every known step is `done`, or `skipped` where the realm mode allows it (R-15,
 * R-54a). In client-only mode the `realm` and `clients` steps are `skipped` because the customer
 * owns the realm, so a deployment whose steps are all settled is set up either way.
 */
export function setupSatisfied(steps: readonly SetupStepView[]): boolean {
  return steps.every(({ state }) => state === "done" || state === "skipped");
}

/**
 * Writes or moves one step's row. The step list, not `updated_at`, is the run order (R-18);
 * `updated_at` only records when the row last moved. Both the insert (through the database
 * default) and the update read the database clock, so the two rows cannot invert under clock
 * skew between the application host and the database host.
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
      set: { state, detail, updatedAt: sql`now()` },
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
      set: { state: "pending", detail: null, updatedAt: sql`now()` },
      setWhere: ne(setupStep.state, "done"),
    });
}

/** The ids of the modules the image compiled, derived once from the one list (D-12). */
function compiledModuleIds(options: SetupOptions): readonly string[] {
  return options.compiledModules.map((module) => module.identity.id);
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
    compiledModuleIds: compiledModuleIds(options),
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

  if (tenant.realm !== undefined) {
    settings.realmMode = tenant.realm;
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
  const moduleIds = compiledModuleIds(options);

  await context.db.transaction(async (tx) => {
    if (moduleIds.length > 0) {
      await tx
        .insert(tenantModule)
        .values(
          moduleIds.map((moduleId) => ({
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
): Promise<StepOutcome> {
  switch (step) {
    case "migrations":
      await migrationsStep(context, options, log);

      return "done";

    case "seed":
      await seedStep(context, files, options);

      return "done";

    case "realm":
      return (await realmStep(context, files, {
        source: options.source,
        output: options.output,
      })) === "skipped"
        ? "skipped"
        : "done";

    case "clients":
      return (await clientsStep(context, {
        source: options.source,
        output: options.output,
      })) === "skipped"
        ? "skipped"
        : "done";

    case "roles":
      await rolesStep(context, options.compiledModules);

      return "done";

    case "admin_seed":
      await adminSeedStep(context, files);

      return "done";

    case "break_glass":
      await breakGlassStep(context, files, { output: options.output });

      return "done";
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
 * moves to `pending` before the work, to `done` (or `skipped`, R-54a) after it, and to `failed`
 * with the cause when it throws, so a later run starts again at that step. The `migrations` step
 * creates `setup_step`, so before that table exists there is no row to write and the command
 * output is the only sink.
 */
async function runStep(
  context: TenantContext,
  step: SetupStep,
  work: () => Promise<StepOutcome>
): Promise<void> {
  const rowWritable = await setupStepTableExists(context);

  if (rowWritable) await markPending(context, step);

  let outcome: StepOutcome;

  try {
    outcome = await work();
  } catch (caught) {
    // The `migrations` step creates `setup_step` itself, so a fresh database reads the table as
    // absent before the work and present after it. Re-check inside the catch: the failed row
    // R-18 asks for must still be written when the table appeared during the step, and R-65 only
    // exempts a run where the table never came to exist. A re-check that throws (a lost
    // connection) counts as "not writable", so the step's own failure stays the reported cause.
    if (
      rowWritable ||
      (await setupStepTableExists(context).catch(() => false))
    ) {
      await recordFailure(
        context,
        step,
        caught instanceof Error ? caught : undefined
      );
    }

    throw caught;
  }

  await writeStep(context, step, outcome, null);
}

/**
 * The realm-mode reconciliation (R-54a): every setup run compares `tenant.yaml`'s `realm` with the
 * `realm_mode` the seed step wrote. While the `realm` step has no row, a difference is written
 * from `tenant.yaml` once — the recovery for a stack seeded before the column existed, whose
 * `realm_mode` keeps the `managed` default — and after the `realm` step has a row a difference is
 * refused, so the mode is never changed by editing `tenant.yaml`. It runs after the seed step and
 * before any later step, so the `realm` and `clients` steps never act on a mode the file would
 * change. The seed step writes the value once on its insert (`ON CONFLICT DO NOTHING`).
 */
async function reconcileRealmMode(
  context: TenantContext,
  files: SetupConfigFiles
): Promise<void> {
  const tenant = await loadTenantYaml(files.tenantConfig);
  const expected = tenant.realm ?? "managed";

  const [row] = await context.db.select().from(tenantSettings).limit(1);
  const stored = row?.realmMode ?? "managed";

  if (expected === stored) return;

  if ((await stepState(context, "realm")) !== undefined) {
    throw new Error(
      `tenant.yaml realm "${expected}" differs from the recorded realm_mode "${stored}"; the realm mode is fixed at setup and cannot be changed by editing tenant.yaml`
    );
  }

  // The write-once recovery: the realm step has not run, so the mode still follows `tenant.yaml`.
  await context.db
    .update(tenantSettings)
    .set({ realmMode: expected })
    .where(sql`true`);
}

/**
 * The advisory lock that serializes whole `genie-ops setup` runs (R-18). It is a fixed key, like
 * the migrator's, and distinct from it, because one run holds this across its steps while the
 * migrator run inside it takes the migrator key. A later run that cannot take it waits on the
 * database, so two concurrent setups never interleave their steps: the seed of one cannot race the
 * roles of another, `admin_seed` and `break_glass` cannot hit the `user.email` unique against each
 * other, and a competing run cannot move a `done` step back.
 */
export const SETUP_LOCK_KEY = 7562301498120385n;

/**
 * Runs `work` while this session holds the setup advisory lock, waiting until any concurrent run
 * releases it. The lock lives on a dedicated pooled client, because a session-level advisory lock
 * belongs to the connection that took it; the client returns to the pool only after the unlock.
 */
async function withSetupLock<T>(
  context: TenantContext,
  work: () => Promise<T>
): Promise<T> {
  const lock = await context.db.$client.connect();

  try {
    await lock.query("select pg_advisory_lock($1)", [
      SETUP_LOCK_KEY.toString(),
    ]);

    return await work();
  } finally {
    try {
      await lock.query("select pg_advisory_unlock($1)", [
        SETUP_LOCK_KEY.toString(),
      ]);
      lock.release();
    } catch {
      // An unlock that fails leaves the lock on this session, so the client is destroyed rather
      // than returned to the pool with the lock still held.
      lock.release(true);
    }
  }
}

/**
 * The resumable `genie-ops setup` (R-18): each step this section knows runs in order, a step
 * already `done` is skipped so a rerun never moves it back and never overwrites seeded rows, and
 * a `failed` step runs again. The runner owns the context and closes its pool; this function
 * writes nothing outside the context. The whole run holds {@link SETUP_LOCK_KEY}, so two runs
 * serialize and cannot split the administrator group or regress a `done` step.
 */
export async function runSetup(
  context: TenantContext,
  files: SetupConfigFiles,
  options: SetupOptions,
  log: MigrationLog
): Promise<void> {
  await withSetupLock(context, async () => {
    for (const step of SETUP_STEPS) {
      // The steps run in their recorded order, each starting only once the one before it is done,
      // so the reads and the step work are sequential on purpose (R-18).
      // oxlint-disable-next-line no-await-in-loop
      const state = await stepState(context, step);

      // A `done` step never reruns. The `realm` and `clients` steps additionally settle as
      // `skipped` in client-only mode (R-54a), and the `clients` step reruns once while its
      // recorded address is still null, so a stack whose steps predate the column gets it
      // written on its next run (R-54c).
      const settled = stepSettled(step, state);

      let needsAddress = false;

      if (step === "clients") {
        // oxlint-disable-next-line no-await-in-loop
        needsAddress = (await keycloakUrlAtSetup(context)) === null;
      }

      if (!settled || needsAddress) {
        // oxlint-disable-next-line no-await-in-loop
        await runStep(context, step, () =>
          stepWork(step, context, files, options, log)
        );
      }

      // After the seed step, on every run, reconcile realm_mode before any later step acts on it,
      // so a rerun whose steps are all done still refuses a realm change in `tenant.yaml` (R-54a).
      if (step === "seed") {
        // oxlint-disable-next-line no-await-in-loop
        await reconcileRealmMode(context, files);
      }
    }
  });
}
