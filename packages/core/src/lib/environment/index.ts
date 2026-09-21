import { z } from "zod";

import type {
  DeploymentEnvironment,
  FileStorageAdapter,
} from "../tenant-context/index.ts";

/** What one environment source looks like before validation. */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** The default largest accepted upload, 15 MB (environment contract, Files). */
const DEFAULT_FILE_MAX_BYTES = 15728640;

/** pino's levels, which `LOG_LEVEL` names (R-44). */
const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const FILE_STORAGE_ADAPTERS = [
  "postgres",
  "s3",
  "gcs",
  "azure",
] as const satisfies readonly FileStorageAdapter[];

/** A comma-separated list. An unset or empty value is an empty list, never a failure. */
function list(value: string | undefined): readonly string[] {
  if (value === undefined) return [];

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** A whole number above zero, written as a string. */
const wholeNumber = z
  .string()
  .regex(/^\d+$/, "a whole number of at least 1")
  .transform(Number)
  .refine((value) => value >= 1, "a whole number of at least 1");

const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        URL.canParse(value) &&
        (value.startsWith("postgres://") || value.startsWith("postgresql://")),
      "a postgres:// or postgresql:// url"
    ),
  PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  FILE_STORAGE_ADAPTER: z.enum(FILE_STORAGE_ADAPTERS).default("postgres"),
  FILE_MAX_BYTES: wholeNumber.default(DEFAULT_FILE_MAX_BYTES),
  GENIE_CHAT_API_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform(list)
    .refine(
      (origins) => origins.every((origin) => origin.startsWith("https://")),
      "https origins only"
    ),
  AUTH_TRUSTED_PROXIES: z
    .string()
    .optional()
    .transform(list)
    .refine(
      (proxies) => !proxies.includes("0.0.0.0/0"),
      "a proxy address or range, never 0.0.0.0/0"
    ),
  LOCK_TIMEOUT_MS: wholeNumber.default(120000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  PORT: wholeNumber
    .refine((port) => port <= 65535, "a port below 65536")
    .default(3000),
});

/**
 * Reads and validates the environment of the Section 0 application profile, before anything
 * opens a connection (R-25, environment contract, Required). A value of a later section is
 * ignored here: a section adds its requirement when it delivers the runtime that consumes it.
 *
 * A failure names every broken variable at once and never repeats the value it rejected, so a
 * password in a malformed `DATABASE_URL` cannot reach a log through the message (R-45).
 */
export function validateEnvironment(
  source: EnvironmentSource = process.env
): DeploymentEnvironment {
  const result = schema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const variable = issue.path.join(".") || "the environment";

      return `${variable}: ${issue.message}`;
    });

    throw new Error(
      `The environment is not valid. ${problems.join(" ")} No value is shown, because a value can hold a secret.`
    );
  }

  const value = result.data;

  if (
    value.FILE_STORAGE_ADAPTER !== "s3" &&
    value.FILE_MAX_BYTES > DEFAULT_FILE_MAX_BYTES
  ) {
    throw new Error(
      `The environment is not valid. FILE_MAX_BYTES: above ${DEFAULT_FILE_MAX_BYTES} needs FILE_STORAGE_ADAPTER=s3 (DEC-44).`
    );
  }

  return {
    databaseUrl: value.DATABASE_URL,
    publicUrl: value.PUBLIC_URL,
    fileStorageAdapter: value.FILE_STORAGE_ADAPTER,
    fileMaxBytes: value.FILE_MAX_BYTES,
    chatAllowedOrigins: value.GENIE_CHAT_API_ALLOWED_ORIGINS,
    authTrustedProxies: value.AUTH_TRUSTED_PROXIES,
    lockTimeoutMs: value.LOCK_TIMEOUT_MS,
    logLevel: value.LOG_LEVEL,
    port: value.PORT,
  };
}
