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

/** One error as a nested field of a log line: its own fields, then the fixed ones. */
function errorToJson(error: Error, seen: WeakSet<object>) {
  // SAFETY: the spread copies the error's own enumerable fields, which are data a call site
  // put there, so `redact` walks them as the json they become on the line.
  const own = redact({ ...error } as LogValue, seen) as Record<
    string,
    LogValue
  >;

  // The fixed fields are written after the error's own, so a field of the same name cannot
  // take their place on the line.
  const line = {
    ...own,
    type: error.name,
    message: redactText(error.message),
    stack: error.stack === undefined ? undefined : redactText(error.stack),
    // SAFETY: a cause is whatever the thrower passed, and a line holds json, which is the
    // shape `redact` answers. An absent cause stays absent: json drops an undefined field.
    cause:
      error.cause === undefined
        ? undefined
        : redact(error.cause as LogValue, seen),
  };

  return line;
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

  // An error carries its fields as not enumerable, so walking its entries answers an empty
  // object. It is turned into the shape a log line needs instead: the kind, the message, the
  // stack and the cause, each redacted.
  if (value instanceof Error) return errorToJson(value, seen);

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
function put(target: Error, name: string, value: LogValue | Error): void {
  Object.defineProperty(target, name, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

function redactError(error: Error, seen = new WeakMap<Error, Error>()): Error {
  const started = seen.get(error);

  // A cause chain can point back at an error it came from. The copy is registered before the
  // chain is walked, so a cycle answers that copy instead of running forever.
  if (started !== undefined) return started;

  // SAFETY: the object takes the error's own prototype and then every own property
  // descriptor of it, so it is that kind of error with those members. Copying descriptors is
  // what carries `cause`: `new Error(message, { cause })` defines it as not enumerable, so
  // an `Object.assign` copy loses it, which is the defect this replaced.
  // SAFETY: every object has a prototype object or null, and `Object.create` takes both.
  const prototype = Object.getPrototypeOf(error) as object;

  const descriptors = Object.getOwnPropertyDescriptors(error);

  // The three fields this function rewrites are left out of the copy, because a descriptor
  // the original froze cannot be redefined on the copy afterwards.
  for (const name of ["message", "stack", "cause"]) delete descriptors[name];

  // Every other own field travels, redacted. A custom error can carry anything, and pino's
  // error serializer writes those fields straight onto the line.
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) continue;

    // SAFETY: an own field of an error is data a call site put there, so `redact` walks it
    // as the json it becomes on the line.
    const value = descriptor.value as LogValue;

    descriptor.value = isSecretName(name) ? REDACTED : redact(value);
  }

  // SAFETY: the object takes the error's own prototype and its remaining descriptors, so it
  // is that kind of error with those members.
  const safe = Object.create(prototype, descriptors) as Error;

  seen.set(error, safe);

  put(safe, "message", redactText(error.message));

  if (error.stack !== undefined) put(safe, "stack", redactText(error.stack));

  const cause: unknown = error.cause;

  // The cause is the diagnosis a reader needs, so it travels, redacted like everything else.
  if (cause instanceof Error) {
    put(safe, "cause", redactError(cause, seen));
  } else if (cause !== undefined) {
    // SAFETY: a cause is whatever the thrower passed, and a log line holds json. `redact`
    // walks it as json, which is the shape it reaches the line in.
    put(safe, "cause", redact(cause as LogValue));
  }

  return safe;
}

/**
 * The hook pino calls for every logged object, which is where redaction lives.
 *
 * The value under `err` stays an error rather than becoming a plain object, so pino's own
 * error serializer keeps an `AppError` logging as an `AppError` with its code beside it. It is
 * redacted here by the same clone the argument hook uses, because a call site can put an error
 * there itself, as `logger.error({ err }, "message")` does, and that one never passed the hook.
 * Cloning an error the hook already cloned changes nothing.
 */
function redactLogObject(object: PinoLogObject): PinoLogObject {
  const { err, ...rest } = object;

  // SAFETY: pino calls this on its way to serializing the object as json, so the value is
  // json already. `redact` walks it as json and answers the same shape.
  const safe = redact(rest as LogValue) as PinoLogObject;

  if (err === undefined) return safe;

  // An error keeps its kind through the clone, so pino's serializer still sees an error.
  if (err instanceof Error) return { ...safe, err: redactError(err) };

  // SAFETY: whatever else a call site put under `err` is json on the line, which is the
  // shape `redact` walks and answers.
  return { ...safe, err: redact(err as LogValue) };
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
