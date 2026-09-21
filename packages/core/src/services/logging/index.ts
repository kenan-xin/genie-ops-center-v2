import { pino } from "pino";
import type { DestinationStream, LogFn, Logger, LoggerOptions } from "pino";

import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";

/** What every line carries, so a log line and an error response name the same request (R-44). */
export type LogBindings = {
  readonly requestId: string;
  readonly tenantId: string;
  /** The signed-in person, or `anonymous` when nobody is signed in. Never invented. */
  readonly userId: string;
};

export const REDACTED = "[redacted]";

/**
 * Field names whose value never reaches a log line, at any depth. Matching is on the name, so
 * `password`, `Password` and `user_password` are all caught (R-45).
 */
const SECRET_NAMES = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "credential",
  "apikey",
  "api_key",
  "databaseurl",
  "database_url",
  "connectionstring",
  "connection_string",
] as const;

/** Query parameters that turn a link into a credential, such as a set-password email link. */
const SECRET_PARAMETERS = ["token", "code", "secret", "key", "signature"];

function isSecretName(name: string): boolean {
  const plain = name.toLowerCase();

  return SECRET_NAMES.some((secret) => plain.includes(secret));
}

/** True for a url carrying a credential, in its query or in its userinfo. */
function isSecretLink(value: string): boolean {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);

  if (url.username !== "" || url.password !== "") return true;

  return SECRET_PARAMETERS.some((name) => url.searchParams.has(name));
}

/** Every url inside a piece of text, however it is punctuated around them. */
const URL_IN_TEXT = /\bhttps?:\/\/[^\s"'<>)\]]+/g;

/** A bare `token=value` pair, which a message can carry without a whole url. */
const SECRET_PAIR = new RegExp(
  `\\b(${SECRET_PARAMETERS.join("|")}|password)=[^\\s&"']+`,
  "gi"
);

/**
 * Replaces the secrets inside one piece of text: a link that carries a token, and a bare
 * `token=value` pair. A message string reaches a log line as it was written, so the same rule
 * has to run on it and not only on the object beside it (R-45).
 */
function redactText(text: string): string {
  return text
    .replace(URL_IN_TEXT, (link) => (isSecretLink(link) ? REDACTED : link))
    .replace(SECRET_PAIR, REDACTED);
}

/** What a log line can hold once it is serialized: json, and nothing else. */
export type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly LogValue[]
  | { readonly [name: string]: LogValue };

/**
 * Replaces every secret value in one logged object, however deeply it sits. Redaction is a
 * property of the logger: no call site decides what is safe to log (R-45).
 */
// A logger's serializer is the one place that must read a value's representation: it is handed
// whatever a call site logged, on its way to json. The two checks below are that inspection.
// oxlint-disable anti-slop/no-runtime-typeof
function redact(value: LogValue, seen = new WeakSet<object>()): LogValue {
  if (typeof value === "string") {
    return isSecretLink(value) ? REDACTED : redactText(value);
  }

  if (value === null || typeof value !== "object") return value;

  if (seen.has(value)) return "[circular]";

  seen.add(value);

  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));

  return Object.fromEntries(
    Object.entries(value).map(([name, member]) => [
      name,
      isSecretName(name) ? REDACTED : redact(member, seen),
    ])
  );
}
// oxlint-enable anti-slop/no-runtime-typeof

/** The object pino hands its `log` formatter, taken from pino's own type. */
type PinoLogObject = Parameters<
  NonNullable<NonNullable<LoggerOptions["formatters"]>["log"]>
>[0];

/**
 * A copy of one error with its message and stack redacted. pino builds `msg` from the error's
 * own message and serializes it by its own path, neither of which the log formatter sees, so
 * the copy is what reaches pino. The prototype and every other field are kept, so an
 * `AppError` still logs as an `AppError` and its cause still travels.
 */
function redactError(error: Error): Error {
  // SAFETY: the new object takes the prototype of the error it copies and then every own
  // field of it, so it is the same kind of error with the same members.
  const prototype = Object.getPrototypeOf(error) as object;

  // SAFETY: the object is created from the error's own prototype, so it is that kind of
  // error, and the assignment below copies every own field onto it.
  const empty = Object.create(prototype) as Error;

  const safe = Object.assign(empty, error);

  safe.message = redactText(error.message);

  if (error.stack !== undefined) safe.stack = redactText(error.stack);

  return safe;
}

/** The hook pino calls for every logged object, which is where redaction lives. */
function redactLogObject(object: PinoLogObject): PinoLogObject {
  // SAFETY: pino calls this on its way to serializing the object as json, so the value is
  // json already. `redact` walks it as json and answers the same shape.
  return redact(object as LogValue) as PinoLogObject;
}

/**
 * The deployment's logger. It writes JSON lines at the level `LOG_LEVEL` names, and every line
 * carries the request, tenant and user ids of the execution that wrote it (R-44).
 *
 * One is built per process from the validated environment. A request or a job run takes a
 * child of it through `forExecution`, which is what puts the three ids on the line.
 */
export function createLogger(
  env: DeploymentEnvironment,
  destination?: DestinationStream
): Logger {
  const options = {
    level: env.logLevel,
    formatters: {
      level: (label: string) => ({ level: label }),
      log: redactLogObject,
    },

    // The formatter above sees the object a call site logged. The message string, and any
    // value interpolated into it, never reach it, so pino's own argument hook redacts those
    // before the line is built (pino 10 `hooks.logMethod`).
    hooks: {
      logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn): void {
        // A log method takes a message string, values interpolated into it, and an object or
        // an error beside them. Reading which is which is the hook's whole job.
        // oxlint-disable anti-slop/no-runtime-typeof
        const safe = args.map((argument) => {
          if (typeof argument === "string") return redactText(argument);

          return argument instanceof Error ? redactError(argument) : argument;
        });
        // oxlint-enable anti-slop/no-runtime-typeof

        // SAFETY: `map` keeps the argument list of the log method it came from, one redacted
        // string for each string. pino's own type for the hook is that same tuple.
        method.apply(this, safe as Parameters<LogFn>);
      },
    },
  };

  return destination === undefined ? pino(options) : pino(options, destination);
}

/** The logger of one request or one job run, carrying its three ids. */
export function forExecution(logger: Logger, bindings: LogBindings): Logger {
  return logger.child({ ...bindings });
}
