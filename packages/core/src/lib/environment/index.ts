import { isIP } from "node:net";

import { z } from "zod";

import type {
  AuthEnvironment,
  DeploymentEnvironment,
  FileStorageAdapter,
  RuntimeMode,
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

/**
 * True for a bare HTTPS origin: scheme, host, optional port, and nothing else. A path, a query,
 * a fragment, a credential or an empty host is not an origin, and `https://` alone is not one
 * either (environment contract, Optional).
 */
function isHttpsOrigin(value: string): boolean {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);

  return (
    url.protocol === "https:" &&
    url.hostname !== "" &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    (url.pathname === "" || url.pathname === "/") &&
    value.replace(/\/$/, "") === url.origin
  );
}

/**
 * True for one proxy address or CIDR range. A prefix length of zero covers the whole internet,
 * which the environment contract forbids by naming `0.0.0.0/0`; the IPv6 spelling of the same
 * range is refused for the same reason.
 */
function isProxyAddress(value: string): boolean {
  const [address = "", prefix, ...rest] = value.split("/");

  if (rest.length > 0) return false;

  const family = isIP(address);

  if (family === 0) return false;

  if (prefix === undefined) return true;

  if (!/^\d+$/.test(prefix)) return false;

  const length = Number(prefix);

  return length >= 1 && length <= (family === 4 ? 32 : 128);
}

/** A whole number above zero, written as a string. */
const wholeNumber = z
  .string()
  .regex(/^\d+$/, "a whole number of at least 1")
  .transform(Number)
  .refine((value) => value >= 1, "a whole number of at least 1");

/** An unset variable and a blank one are the same thing to the mail rows of the contract. */
function unsetWhenBlank(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * The image's runtime mode. It reads `process.env.NODE_ENV` only, never the environment source:
 * the build inlines that expression as `"production"`, so no `.env` value can flip a production
 * image into development mode, where a full tokenized link is logged and an unconfigured send is
 * silently skipped (R-45, R-49). Only the exact value `development` is special; every other value,
 * known or not, fails closed as production. Tests pin the mode through `process.env`.
 */
function runtimeModeOf(): RuntimeMode {
  return process.env.NODE_ENV === "development" ? "development" : "production";
}

/** The two schemes a `SMTP_URL` may use; the contract shows the `smtps://` form of the two. */
function isSmtpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);

  return (
    (url.protocol === "smtp:" || url.protocol === "smtps:") &&
    url.hostname !== ""
  );
}

const schema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        URL.canParse(value) &&
        (value.startsWith("postgres://") || value.startsWith("postgresql://")),
      "a postgres:// or postgresql:// url"
    )
    // The url carries the database password, so the generated example leaves it
    // blank and no consumer may echo it (R-45).
    .meta({ secret: true }),
  PUBLIC_URL: z.url({ protocol: /^https?$/ }),
  FILE_STORAGE_ADAPTER: z.enum(FILE_STORAGE_ADAPTERS).default("postgres"),
  FILE_MAX_BYTES: wholeNumber.default(DEFAULT_FILE_MAX_BYTES),
  GENIE_CHAT_API_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform(list)
    .refine(
      (origins) => origins.every(isHttpsOrigin),
      "each entry is one https origin, such as https://chat.example.com"
    ),
  AUTH_TRUSTED_PROXIES: z
    .string()
    .optional()
    .transform(list)
    .refine(
      (proxies) => proxies.every(isProxyAddress),
      "each entry is one ip address or cidr range, never the whole internet"
    ),
  LOCK_TIMEOUT_MS: wholeNumber.default(120000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  PORT: wholeNumber
    .refine((port) => port <= 65535, "a port below 65536")
    .default(3000),
  MAIL_PROVIDER: z.string().optional().transform(unsetWhenBlank),
  MAIL_FROM: z.string().optional().transform(unsetWhenBlank),
  // An API key and an smtps url both carry a credential, so the generated
  // example leaves them blank and no consumer may echo them (R-45).
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform(unsetWhenBlank)
    .meta({ secret: true }),
  SMTP_URL: z
    .string()
    .optional()
    .transform(unsetWhenBlank)
    .meta({ secret: true }),
  // Section 2 authentication values (environment contract, Required). They are optional in the
  // base schema so `genie-ops migrate` and the worker still start without them; the application
  // profile requires them, and the Section 2 commands validate their own consuming profile.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "at least 32 characters")
    .optional()
    .meta({ secret: true }),
  KEYCLOAK_URL: z.string().min(1).optional(),
  KEYCLOAK_REALM: z.string().min(1).optional(),
  KEYCLOAK_CLIENT_ID: z.string().min(1).optional(),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1).optional().meta({ secret: true }),
});

/**
 * The mail values of the environment contract, "Mail". A provider names the mailer of R-43 and
 * its own credential; `MAIL_PROVIDER` unset means no mailer, which is a valid deployment (R-45).
 */
function mailConfiguration(value: {
  readonly MAIL_PROVIDER: string | undefined;
  readonly MAIL_FROM: string | undefined;
  readonly RESEND_API_KEY: string | undefined;
  readonly SMTP_URL: string | undefined;
}): Pick<
  DeploymentEnvironment,
  "mailProvider" | "mailFrom" | "resendApiKey" | "smtpUrl"
> {
  const problems: string[] = [];
  const raw = value.MAIL_PROVIDER;
  let provider: DeploymentEnvironment["mailProvider"] = "none";

  if (raw === "resend" || raw === "smtp") provider = raw;
  else if (raw !== undefined)
    problems.push('MAIL_PROVIDER: "resend" or "smtp"');

  if (
    value.MAIL_FROM !== undefined &&
    !z.email().safeParse(value.MAIL_FROM).success
  ) {
    problems.push("MAIL_FROM: a sender email address");
  }

  if (value.SMTP_URL !== undefined && !isSmtpUrl(value.SMTP_URL)) {
    problems.push("SMTP_URL: an smtp:// or smtps:// url");
  }

  if (provider !== "none") {
    if (value.MAIL_FROM === undefined) {
      problems.push("MAIL_FROM: required when MAIL_PROVIDER is set");
    }

    if (provider === "resend" && value.RESEND_API_KEY === undefined) {
      problems.push("RESEND_API_KEY: required when MAIL_PROVIDER=resend");
    }

    if (provider === "smtp" && value.SMTP_URL === undefined) {
      problems.push("SMTP_URL: required when MAIL_PROVIDER=smtp");
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `The environment is not valid. ${problems.join(" ")} No value is shown, because a value can hold a secret.`
    );
  }

  return {
    mailProvider: provider,
    mailFrom: value.MAIL_FROM,
    resendApiKey: value.RESEND_API_KEY,
    smtpUrl: value.SMTP_URL,
  };
}

/**
 * Which runtime is asking. The base schema is one catalogue for every profile; a profile decides
 * which of its values are *required* (environment contract, "Required").
 *
 * - `core`: `DATABASE_URL`, `PUBLIC_URL` and the defaulted values. The migrator, a command and a
 *   test use this, so `genie-ops migrate` runs without sign-in or realm credentials.
 * - `application`: `core` plus the Section 2 authentication values, which the app must refuse to
 *   start without (`BETTER_AUTH_SECRET`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`,
 *   `KEYCLOAK_CLIENT_SECRET`). A valid set does not require the realm to exist yet.
 */
export type EnvironmentProfile = "core" | "application";

/** The values the base schema parses to, before the profile decides what is required. */
type ParsedEnvironment = z.infer<typeof schema>;

/** The five Section 2 values the application profile requires (environment contract, Required). */
const authSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "at least 32 characters"),
  KEYCLOAK_URL: z.string().min(1),
  KEYCLOAK_REALM: z.string().min(1),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
});

/**
 * The Section 2 authentication values. The application profile requires all five. Any other
 * profile passes them through only when all five are present, so a context built by a test or a
 * command with the full set still builds its Better Auth member while a partial set is ignored.
 */
function authConfiguration(
  value: ParsedEnvironment,
  profile: EnvironmentProfile
): AuthEnvironment | undefined {
  const parsed = authSchema.safeParse(value);

  if (!parsed.success) {
    if (profile === "application") {
      const missing = parsed.error.issues
        .map((issue) => issue.path.join("."))
        .filter((name) => name !== "");

      throw new Error(
        `The environment is not valid. ${missing.join(", ")}: required by the Section 2 application profile. No value is shown, because a value can hold a secret.`
      );
    }

    return undefined;
  }

  return {
    betterAuthSecret: parsed.data.BETTER_AUTH_SECRET,
    // R-54c: a trailing slash is removed once, so a later issuer comparison is exact.
    keycloakUrl: parsed.data.KEYCLOAK_URL.replace(/\/+$/, ""),
    keycloakRealm: parsed.data.KEYCLOAK_REALM,
    keycloakClientId: parsed.data.KEYCLOAK_CLIENT_ID,
    keycloakClientSecret: parsed.data.KEYCLOAK_CLIENT_SECRET,
  };
}

/**
 * Reads and validates the environment of the selected profile, before anything opens a
 * connection (R-25, environment contract, Required). A failure names every broken variable at
 * once and never repeats the value it rejected, so a password in a malformed `DATABASE_URL`
 * cannot reach a log through the message (R-45).
 */
export function validateEnvironment(
  source: EnvironmentSource = process.env,
  profile: EnvironmentProfile = "core"
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

  const auth = authConfiguration(value, profile);

  const environment: DeploymentEnvironment = {
    databaseUrl: value.DATABASE_URL,
    publicUrl: value.PUBLIC_URL,
    fileStorageAdapter: value.FILE_STORAGE_ADAPTER,
    fileMaxBytes: value.FILE_MAX_BYTES,
    chatAllowedOrigins: value.GENIE_CHAT_API_ALLOWED_ORIGINS,
    authTrustedProxies: value.AUTH_TRUSTED_PROXIES,
    lockTimeoutMs: value.LOCK_TIMEOUT_MS,
    logLevel: value.LOG_LEVEL,
    port: value.PORT,
    runtimeMode: runtimeModeOf(),
    ...mailConfiguration(value),
  };

  // `auth` is added only when it is present, so a profile that does not read it leaves the key off
  // the object entirely rather than carrying an explicit `undefined` (environment contract).
  return auth === undefined ? environment : { ...environment, auth };
}

/** One environment variable as the schema declares it (R-30, `deploy/schemas/environment.catalogue.json`). */
export type EnvironmentVariable = {
  readonly name: string;
  readonly required: boolean;
  readonly default?: string | number | boolean;
  readonly secret: boolean;
};

/**
 * The scalar a catalogue entry can print. A list or object default is deliberately not one, so
 * the generated example leaves those variables blank for the operator.
 */
const catalogueScalar = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Derives one catalogue entry from the field itself. Parsing the absent value answers both
 * questions at once: a field that refuses it is required, and a field that accepts it hands back
 * the default the schema applies. A field is secret when its own schema says so (`.meta`), so no
 * answer here is a hand-kept second list.
 */
function catalogueEntry(name: string, field: z.ZodType): EnvironmentVariable {
  const absent = field.safeParse(undefined);
  const secret = field.meta()?.secret === true;

  if (!absent.success) {
    return { name, required: true, secret };
  }

  const resolved = catalogueScalar.safeParse(absent.data);

  if (!resolved.success) {
    return { name, required: false, secret };
  }

  return { name, required: false, secret, default: resolved.data };
}

/**
 * Every variable the Section 0 environment schema reads, with its requirement, default and
 * secret flag. Core emits it to `deploy/schemas/environment.catalogue.json` through
 * `nx run core:schemas`, and the tenant generator renders `.env.example` from that file, so the
 * schema, the editor's example and the customer stack cannot drift (R-30, R-31).
 */
export const environmentCatalogue: readonly EnvironmentVariable[] =
  Object.entries(schema.shape)
    .map(([name, field]) => catalogueEntry(name, field))
    .toSorted((left, right) => left.name.localeCompare(right.name));
