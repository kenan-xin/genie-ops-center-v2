import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  type EnvironmentSource,
  validateEnvironment,
} from "../environment/index.ts";

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
 * The one object every procedure, job and page reads through (DEC-34). In Section 0 it holds
 * fixed members only. Section 1 adds settings, branding and entitlements as readers that expire
 * after ten seconds (DEC-46, R-18); adding a member here is how that arrives.
 */
export type TenantContext = {
  readonly db: NodePgDatabase<Record<string, never>> & {
    readonly $client: Pool;
  };
  readonly env: DeploymentEnvironment;
};

/**
 * Builds one tenant context (R-17). The environment is validated first, so a deployment with a
 * broken value fails before anything opens a connection (R-25). The pool is lazy: it connects on
 * the first query, never here.
 *
 * One process builds one context, once, and passes it down. Core exports this factory and no
 * global context, no pool and no `db`, `settings`, `branding` or `storage` singleton (DEC-34).
 * Close the pool through `context.db.$client.end()` when the process ends or a test finishes.
 */
export function createTenantContext(
  source: EnvironmentSource = process.env
): TenantContext {
  const env = validateEnvironment(source);

  const pool = new Pool({ connectionString: env.databaseUrl });

  return { db: drizzle(pool), env };
}
