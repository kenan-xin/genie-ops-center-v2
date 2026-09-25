import { randomUUID } from "node:crypto";

import {
  type EnvironmentSource,
  type MigrationLog,
  type RedactingLogger,
  type TenantContext,
  createLogger,
  createTenantContext,
  forExecution,
  migrationPlan,
  moduleHistory,
  readSetupProgress,
  runMigrations,
  setupSatisfied,
  validateEnvironment,
} from "@genie/core";
import type { FrameOriginProvider } from "@genie/core/security";

import { type AppContext, publishContext } from "./context.ts";
import { compiledModuleIds, modules, moduleRoutes } from "./registry.ts";

/**
 * Wraps every module's optional viewer provider so each call is recorded.
 *
 * R-49a requires counting invocations: zero on ordinary pages, route handlers,
 * health, assets and background requests, and only the owning provider on a
 * viewer document. The count has to be observable on the built image, so each
 * call writes one structured line that acceptance reads back from the container
 * log. This adds no endpoint and exposes no tenant data.
 */
function buildViewerProviders(
  logger: RedactingLogger
): ReadonlyMap<string, FrameOriginProvider<{ tenant: TenantContext }>> {
  const entries = modules.flatMap((module) => {
    const declared = module.contentSecurityPolicy;

    if (declared === undefined) return [];

    const counted: FrameOriginProvider<{ tenant: TenantContext }> = {
      frameOrigins: (ctx) => {
        logger.info(
          { moduleId: module.identity.id },
          "frame origin provider invoked"
        );

        return declared.frameOrigins(ctx);
      },
    };

    return [[module.identity.id, counted] as const];
  });

  return new Map(entries);
}

export type BootstrapOptions = {
  readonly source?: EnvironmentSource;
  /**
   * Injected only by tests, so the failure budget can be exercised with a
   * logger whose `flush` never settles. The image never passes this, so no
   * fault-injection switch ships in production code.
   */
  readonly logger?: RedactingLogger;
  readonly connect?: (source: EnvironmentSource) => AppContext;
  readonly migrate?: (context: AppContext) => Promise<void>;
  readonly publish?: (context: AppContext) => void;
  readonly exit?: (code: number) => void;
  /** One total budget for diagnostics, cleanup and log flushing (R-19b amendment). */
  readonly budgetMs?: number;
};

function withinBudget<T>(
  work: Promise<T>,
  budgetMs: number
): Promise<T | undefined> {
  return Promise.race([
    work.catch(() => undefined),
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), budgetMs)
    ),
  ]);
}

/**
 * Best-effort shutdown after a failed bootstrap. Its one job is to leave the
 * caller able to exit, so it never throws: a secondary failure in the failure
 * diagnostic or in cleanup must not become the thing that decides whether the
 * process exits. Diagnostics, cleanup and log flushing share the single deadline
 * of R-19b, taken once so a hanging step cannot spend a per-phase budget.
 */
async function runFailureShutdown(input: {
  logger: RedactingLogger | undefined;
  context: AppContext | undefined;
  failure: unknown;
  budgetMs: number;
}): Promise<void> {
  const deadline = Date.now() + input.budgetMs;
  const remaining = () => Math.max(0, deadline - Date.now());

  // A logger whose transport is broken or closed can throw here; the primary
  // failure is already known, so the diagnostic is best-effort.
  try {
    input.logger?.error({ err: input.failure }, "bootstrap failed");
  } catch {
    // Secondary failure: swallowed on purpose, the shutdown continues.
  }

  const context = input.context;

  if (context !== undefined) {
    // Started inside the promise chain so a synchronous throw from `end`
    // becomes a rejection `withinBudget` already swallows.
    await withinBudget(
      Promise.resolve().then(() => context.tenant.db.$client.end()),
      remaining()
    );
  }

  const logger = input.logger;

  if (logger !== undefined) {
    // `flush` can throw synchronously (pino proto.js); inside the executor that
    // is a rejection, which `withinBudget` bounds like any other failure.
    await withinBudget(
      Promise.resolve().then(
        () =>
          new Promise<void>((resolve) => {
            logger.flush(() => resolve());
          })
      ),
      remaining()
    );
  }
}

/**
 * The setup gate of D-2. The latch is a closure over the one context object, which the bootstrap
 * stores in the process-global slot, so every bundle shares it and it never moves back once true.
 *
 * The latch short-circuits before any read, so a set-up deployment stops querying `setup_step` per
 * request. Only a satisfied read opens it and no read ever clears it, so a read that started before
 * setup finished cannot close it again (finding 3). A read failure before the gate ever opened
 * propagates, so the proxy answers a generic 503; the gate never reads after it opens.
 */
function buildSetupGate(tenant: TenantContext): AppContext["setupGate"] {
  let open = false;

  return {
    isSatisfied: async () => {
      if (open) return true;

      if (setupSatisfied(await readSetupProgress(tenant))) open = true;

      return open;
    },
  };
}

/**
 * Builds the one application context from the validated environment. It is kept
 * apart from `runBootstrap` so the ordering there stays readable, and it is only
 * reached when no test injected a context of its own.
 */
function buildContext(
  source: EnvironmentSource,
  env: ReturnType<typeof validateEnvironment>,
  logger: RedactingLogger
): AppContext {
  const contextId = randomUUID();
  const tenant = createTenantContext(source, logger, compiledModuleIds);

  return {
    tenant,
    startedAt: Date.now(),
    contextId,
    moduleRoutes,
    setupGate: buildSetupGate(tenant),
    viewerProviders: buildViewerProviders(logger),
    reportProviderFailure: (cause, meta) =>
      logger.error(
        { err: cause, moduleId: meta.moduleId, requestId: meta.requestId },
        "frame origin provider failed"
      ),
    logRequest: (meta) =>
      forExecution(logger, {
        requestId: meta.requestId,
        tenantId: env.publicUrl,
        userId: "anonymous",
      }).info({ contextId, path: meta.path }, "request"),
    logError: (cause, meta) =>
      forExecution(logger, {
        requestId: meta.requestId,
        tenantId: env.publicUrl,
        userId: "anonymous",
      }).error({ err: cause, contextId }, "request failed"),
  };
}

/**
 * Adapts the migrator's own event stream to the process logger. The event name is the message,
 * so an operator greps the container log with the same words the run uses, and a cleanup failure
 * keeps the cause the run swallowed, which is the only place that cause can reach anyone (R-45).
 */
function migrationLog(logger: RedactingLogger): MigrationLog {
  return (event) => {
    const fields = {
      history: event.history,
      count: event.count,
      err: event.error,
    };

    if (event.event === "migration-cleanup-failed") {
      logger.error(fields, event.event);

      return;
    }

    logger.info(fields, event.event);
  };
}

/**
 * Validate, connect, migrate, publish. Order is the requirement: validation
 * precedes every database connection, and migrations precede publication, so no
 * request-bound path can reach a context before the schema is ready.
 *
 * A failure never throws out of here. The framework does not exit on a thrown
 * bootstrap error; it logs and keeps running, which would leave a container
 * alive after a failed migration. This function exits nonzero itself.
 */
export async function runBootstrap(
  options: BootstrapOptions = {}
): Promise<void> {
  const source = options.source ?? process.env;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const budgetMs = options.budgetMs ?? 5000;

  let logger: RedactingLogger | undefined;
  let context: AppContext | undefined;
  let failure: unknown;
  let failed = false;

  try {
    const env = validateEnvironment(source);
    const activeLogger = options.logger ?? createLogger(env);

    logger = activeLogger;

    const ready =
      options.connect === undefined
        ? buildContext(source, env, activeLogger)
        : options.connect(source);

    context = ready;

    const migrate =
      options.migrate ??
      ((started: AppContext) =>
        runMigrations({
          env: started.tenant.env,
          pool: started.tenant.db.$client,
          histories: migrationPlan(modules.map(moduleHistory)),
          compiledModuleIds,
          log: migrationLog(activeLogger),
        }));

    await migrate(ready);

    (options.publish ?? publishContext)(ready);

    activeLogger.info(
      { modules: compiledModuleIds, contextId: ready.contextId },
      "bootstrap complete"
    );
  } catch (caught) {
    failed = true;
    failure = caught;

    // Validation runs before the logger exists, so a rejected environment would otherwise exit
    // with nothing in the log. A minimal logger carries the validator's own message, which names
    // the invalid variables and never a value (R-45), to the container log. An injected logger
    // is left in place, so the failure path still writes through the process's own logger.
    logger ??= createLogger({ logLevel: "info" });
  } finally {
    // The failure path runs from `finally`, not the catch body, so no secondary
    // failure in diagnostics or cleanup can skip the exit below. `exit` is the
    // last statement of an inner `finally` for the same reason.
    if (failed) {
      try {
        await runFailureShutdown({ logger, context, failure, budgetMs });
      } finally {
        exit(1);
      }
    }
  }
}
