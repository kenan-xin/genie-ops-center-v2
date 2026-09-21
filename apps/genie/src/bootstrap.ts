import { randomUUID } from "node:crypto";

import {
  type EnvironmentSource,
  type RedactingLogger,
  type TenantContext,
  createLogger,
  createTenantContext,
  forExecution,
  migrationPlan,
  moduleHistory,
  runMigrations,
  validateEnvironment,
} from "@genie/core";
import type { FrameOriginProvider } from "@genie/core/security";

import { type AppContext, publishContext } from "./context.ts";
import { modules } from "./registry.ts";

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

  return {
    tenant: createTenantContext(source),
    startedAt: Date.now(),
    contextId,
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
        }));

    await migrate(ready);

    (options.publish ?? publishContext)(ready);

    activeLogger.info(
      {
        modules: modules.map((module) => module.identity.id),
        contextId: ready.contextId,
      },
      "bootstrap complete"
    );
  } catch (caught) {
    const deadline = Date.now() + budgetMs;

    logger?.error({ err: caught }, "bootstrap failed");

    if (context !== undefined) {
      await withinBudget(
        Promise.resolve(context.tenant.db.$client.end()),
        Math.max(0, deadline - Date.now())
      );
    }

    if (logger !== undefined) {
      await withinBudget(
        new Promise<void>((resolve) => {
          logger?.flush(() => resolve());
        }),
        Math.max(0, deadline - Date.now())
      );
    }

    exit(1);
  }
}
