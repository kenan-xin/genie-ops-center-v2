import type { NodePgDatabase } from "drizzle-orm/node-postgres";

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
  readonly db: NodePgDatabase;
  readonly env: DeploymentEnvironment;
};
