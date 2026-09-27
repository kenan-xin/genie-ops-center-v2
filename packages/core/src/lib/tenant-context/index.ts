import { randomBytes } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import {
  createAuthMember,
  type AuthMember,
} from "../../services/auth/index.ts";
import {
  createCapabilityRegistry,
  type CapabilityRegistry,
} from "../../services/capabilities/index.ts";
import {
  createEventBus,
  type EventBus,
} from "../../services/event-bus/index.ts";
import {
  createFileStorage,
  type FileStorage,
} from "../../services/file-storage/index.ts";
import {
  createJobQueue,
  type JobQueue,
} from "../../services/job-queue/index.ts";
import type { RedactingLogger } from "../../services/logging/index.ts";
import {
  createMailer,
  type Mailer,
  type MailProvider,
} from "../../services/mailer/index.ts";
import {
  type EnvironmentProfile,
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
 * The image's runtime mode, resolved once from `NODE_ENV` (environment contract). Only
 * `development` may log a working link; every other value is treated as production so an
 * unrecognized mode fails closed (R-49).
 */
export type RuntimeMode = "development" | "production";

/**
 * How long a caller may wait for a pooled connection, kept strictly above the migrator's lock wait
 * (dm9). A database that accepts TCP and never answers holds every pooled client on its connect
 * attempt, so without a bound the pool fills after `max` calls and never recovers, starving the
 * app and the worker even after the database returns. Bounding the wait makes each hung connect
 * and each queued checkout fail at the bound, so the pool self-heals.
 *
 * The bound must exceed `lockTimeoutMs`: the migrator holds one pooled session for up to that long
 * while it waits for the advisory lock, and a concurrent run (the worker and the app bootstrap
 * alike) must be allowed to wait out that hold before it fails. `lockTimeoutMs` defaults to
 * 120000, so the default bound is 125000; a shorter value would turn a slow lock release into a
 * failed start.
 */
const CONNECTION_TIMEOUT_MARGIN_MS = 5000;

/**
 * The Section 2 authentication values the application profile requires and the other profiles do
 * not read (environment contract, Required). They are configuration only: a valid set does not
 * require the realm to exist yet, so the app serves the not-set-up page first (Spec 2 R-4).
 */
export type AuthEnvironment = {
  /** `BETTER_AUTH_SECRET`, at least 32 characters; signs the session cookie (R-4). */
  readonly betterAuthSecret: string;
  /** `KEYCLOAK_URL` without a trailing slash (R-4, R-54c). */
  readonly keycloakUrl: string;
  readonly keycloakRealm: string;
  readonly keycloakClientId: string;
  readonly keycloakClientSecret: string;
};

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
  /** The validated runtime mode (`NODE_ENV`); only `development` logs a working link (R-49). */
  readonly runtimeMode: RuntimeMode;
  /** The `MAIL_PROVIDER` selection; `none` is the unset value (environment contract, "Mail"). */
  readonly mailProvider: MailProvider;
  /** The `MAIL_FROM` sender address, present exactly when a provider is selected. */
  readonly mailFrom: string | undefined;
  /** The `RESEND_API_KEY` credential, present exactly when `MAIL_PROVIDER=resend`. */
  readonly resendApiKey: string | undefined;
  /** The `SMTP_URL` connection string, present exactly when `MAIL_PROVIDER=smtp`. */
  readonly smtpUrl: string | undefined;
  /**
   * The Section 2 authentication values, present exactly when the profile that builds this
   * context consumes them (the application profile requires them; a worker, a command or a test
   * may omit them). The member `auth` is built iff this is present.
   */
  readonly auth?: AuthEnvironment;
};

/**
 * The one object every procedure, job and page reads through (DEC-34). It holds its fixed members
 * (`db`, `env`, `jobQueue`, `fileStorage`, `mailer`) and the three cached tenant readers of R-5,
 * each of which expires ten seconds after it is filled (DEC-46). A later service ticket adds its
 * own flat readonly member here.
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
  /** The pg-boss job queue over this context's pool (D-11). It starts on first use. */
  readonly jobQueue: JobQueue;
  /** The typed event bus (R-53). Emission happens through `withTransaction`. */
  readonly events: EventBus;
  /** The capabilities channel: a provider or nothing, never a module import (R-58). */
  readonly capabilities: CapabilityRegistry;
  /** The file store of R-6, over the adapter `FILE_STORAGE_ADAPTER` selects. */
  readonly fileStorage: FileStorage;
  /** The mailer of R-43, built once from the validated environment; `provider` is `none` when `MAIL_PROVIDER` is unset (D-7). */
  readonly mailer: Mailer;
  /** Builds an absolute link from `PUBLIC_URL` alone, never from a request `Host` (R-70). */
  readonly publicUrl: PublicUrlBuilder;
  /**
   * The one Better Auth instance of this context (R-4). It is present exactly when the environment
   * carried the authentication values; the application profile requires them, and a worker or
   * command profile that does not consume authentication builds no member.
   */
  readonly auth?: AuthMember;
};

/** An absolute link to `path` under `PUBLIC_URL`, with `query` as its search string (R-70). */
export type PublicUrlBuilder = (
  path: string,
  query?: Readonly<Record<string, string>>
) => string;

/** The identity provider callback path Section 2 registers in the realm (Spec 2 R-5). */
export const IDENTITY_CALLBACK_PATH = "/api/auth/callback/keycloak";

/**
 * The one builder of public links (R-70). Its only input is the configured address, so a request
 * cannot steer it. A path prefix on `PUBLIC_URL` is kept, which `new URL(path, base)` would drop.
 */
export function createPublicUrl(base: string): PublicUrlBuilder {
  return (path, query) => {
    if (!path.startsWith("/")) {
      throw new Error(`A public link path must start with "/": ${path}`);
    }

    // The query goes in `query`. A `?` or `#` in the path would be percent-encoded into it and
    // break the link silently.
    if (/[?#]/.test(path)) {
      throw new Error(`A public link path must not hold "?" or "#": ${path}`);
    }

    const url = new URL(base);

    url.pathname = `${url.pathname.replace(/\/$/, "")}${path}`;
    url.search = new URLSearchParams(query).toString();
    url.hash = "";

    return url.toString();
  };
}

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
 *
 * `applicationName` names the pool in Postgres `application_name`, with a per-pool id after a
 * colon (`genie-worker:1a2b3c4d`), so the server's session list tells the application, the worker
 * and a command apart, and a second pool in one process shows as a second id (AC-3).
 */
export function createTenantContext(
  source: EnvironmentSource,
  logger: Pick<RedactingLogger, "error" | "info">,
  compiledModuleIds: readonly string[],
  applicationName?: string,
  /**
   * Which runtime is building this context. The application profile requires the Section 2
   * authentication values; every other profile does not, so `genie-ops migrate` and the worker
   * still start without a realm or sign-in secret (environment contract, "Required").
   */
  profile: EnvironmentProfile = "core"
): TenantContext {
  const env = validateEnvironment(source, profile);

  const pool = new Pool({
    connectionString: env.databaseUrl,
    application_name:
      applicationName === undefined
        ? undefined
        : `${applicationName}:${randomBytes(4).toString("hex")}`,
    connectionTimeoutMillis: env.lockTimeoutMs + CONNECTION_TIMEOUT_MARGIN_MS,
  });

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
  const readers = createTenantReaders({ db, compiledModuleIds });

  const jobQueue = createJobQueue(pool, logger);
  const capabilities = createCapabilityRegistry();
  const publicUrl = createPublicUrl(env.publicUrl);

  // The one Better Auth instance (R-4), built here from values this context already holds and
  // over this context's own pool. It opens no connection. A profile without the auth values
  // builds no member (environment contract, worker and command rows).
  const auth =
    env.auth === undefined
      ? undefined
      : createAuthMember({
          db,
          publicUrl: env.publicUrl,
          auth: env.auth,
          trustedProxies: env.authTrustedProxies,
          runtimeMode: env.runtimeMode,
        });

  const base: Omit<TenantContext, "auth"> = {
    db,
    env,
    ...readers,
    jobQueue,
    events: createEventBus({
      jobQueue,
      logger,
      // The context is finished only after this literal, so the bus takes it lazily; the first
      // dispatched handler finds the whole object, readers included.
      tenant: () => context,
    }),
    capabilities,
    fileStorage: createFileStorage(db, env, publicUrl),
    mailer: createMailer(env, {
      branding: readers.branding,
      logger,
      publicUrl,
    }),
    publicUrl,
  };

  // The auth member is added only when the environment carried it, so a profile that does not
  // consume authentication leaves the key off the object rather than carrying an explicit
  // `undefined` (environment contract, worker and command rows).
  const context: TenantContext = auth === undefined ? base : { ...base, auth };

  // The logger the pool's error listener already uses is recorded off the object, where
  // `withTransaction` reads it for its after-commit diagnostics. A context this factory did not
  // build has no entry. Nothing here reads a reader, so the factory opens no connection (R-19).
  registerContextLogger(context, logger);

  return context;
}
