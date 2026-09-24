import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { RedactingLogger } from "../../services/logging/index.ts";
import {
  type EnvironmentSource,
  validateEnvironment,
} from "../environment/index.ts";
import { createTenantReaders, type TenantReaders } from "./readers.ts";
import { registerContextLogger } from "./with-transaction.ts";

export type {
  BrandingReader,
  EntitlementReader,
  SettingsReader,
  TenantBranding,
  TenantReaders,
  TenantSettings,
} from "./readers.ts";

export type FileStorageAdapter = "postgres" | "s3" | "gcs" | "azure";

/**
 * The environment values the image reads, after validation (environment contract, Required).
 * Values a tenant administrator owns live in the database, never here.
 */
export type DeploymentEnvironment = {
  readonly databaseUrl: string;
  readonly publicUrl: string;
  readonly fileStorageAdapter: FileStorageAdapter;
  readonly fileMaxBytes: number;
  readonly chatAllowedOrigins: readonly string[];
  readonly authTrustedProxies: readonly string[];
  readonly lockTimeoutMs: number;
  readonly logLevel: string;
  readonly port: number;
};

/**
 * The one object every procedure, job and page reads through (DEC-34). It holds its two fixed
 * members and the three cached tenant readers of R-5, each of which expires ten seconds after it
 * is filled (DEC-46). A later service ticket adds its own flat readonly member here.
 */
export type TenantContext = {
  readonly db: NodePgDatabase<Record<string, never>> & {
    readonly $client: Pool;
  };
  readonly env: DeploymentEnvironment;
  /** The settings reader of R-5. */
  readonly settings: TenantReaders["settings"];
  /** The branding reader of R-5. */
  readonly branding: TenantReaders["branding"];
  /** The module entitlement reader of R-5, a gate separate from `can()` (DEC-39). */
  readonly entitlements: TenantReaders["entitlements"];
};

/**
 * Builds one tenant context (R-17). The environment is validated first, so a deployment with a
 * broken value fails before anything opens a connection (R-25). The pool is lazy: it connects on
 * the first query, never here.
 *
 * One process builds one context, once, and passes it down. Core exports this factory and no
 * global context, no pool and no `db`, `settings`, `branding` or `storage` singleton (DEC-34).
 * Close the pool through `context.db.$client.end()` when the process ends or a test finishes.
 *
 * `logger` is required, not optional. The image builds one redacting logger per process and
 * passes it here, and a pool error that no one is awaiting is recorded through it, so a database
 * that keeps dropping idle sessions is visible instead of silent (R-45). A test or helper that
 * needs no output passes `silentLogger()`; requiring the argument means no production path can
 * omit it and swallow the error by accident.
 *
 * `compiledModuleIds` is required for the same reason: it is the one caller-supplied list of the
 * modules the image compiled, and the entitlement reader closes over it here so the migrator run
 * and the reader cannot disagree (D-12). A caller that has no modules passes `[]`.
 */
export function createTenantContext(
  source: EnvironmentSource,
  logger: Pick<RedactingLogger, "error">,
  compiledModuleIds: readonly string[]
): TenantContext {
  const env = validateEnvironment(source);

  const pool = new Pool({ connectionString: env.databaseUrl });

  pool.on("connect", (client) => {
    // A checked-out pg client has no pool error listener. Keep the error handled while the
    // caller's query rejects through its normal path, preserving that operation's original error.
    client.on("error", () => {});
  });

  pool.on("error", (error) => {
    // pg-pool raises this only for an IDLE client it has already dropped, so no caller's query is
    // in flight and the next query opens a fresh connection. That is a blip, not a failed start
    // (R-27), so the broken client is discarded and the process stays up. Without this listener
    // Node turns the event into an uncaught exception and the process exits
    // (genie-ops-center-v2-akh).
    logger.error({ err: error }, "idle database client error");
  });

  const db = drizzle(pool);
  const readers = createTenantReaders({ pool, compiledModuleIds });

  const context: TenantContext = { db, env, ...readers };

  // The logger the pool's error listener already uses is recorded off the object, where
  // `withTransaction` reads it for its after-commit diagnostics. A context this factory did not
  // build has no entry. Nothing here reads a reader, so the factory opens no connection (R-19).
  registerContextLogger(context, logger);

  return context;
}
