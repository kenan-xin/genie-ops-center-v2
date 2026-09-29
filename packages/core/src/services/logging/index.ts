import { pino } from "pino";
import type {
  Bindings,
  ChildLoggerOptions,
  DestinationStream,
  LevelWithSilentOrString,
  LogFn,
  Logger,
  LoggerOptions,
} from "pino";

import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";

/** What every line carries, so a log line and an error response name the same request (R-44). */
export type LogBindings = {
  readonly requestId: string;
  readonly tenantId: string;
  /** The signed-in person, or `anonymous` when nobody is signed in. Never invented. */
  readonly userId: string;
  /**
   * The id the whole chain of a request and its follow-up events shares, so every line of that
   * chain is greppable by one value. It is the request id for a request; an event handler and the
   * durable job it runs from carry the id of the request or event that caused them.
   */
  readonly correlationId: string;
};

import {
  REDACTED,
  isSecretLink,
  isSecretName,
  redactText,
} from "./line-rules.ts";

export { REDACTED } from "./line-rules.ts";

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
 *
 * Exported so a surface that must show captured child output, such as the release
 * pipeline's failed-gate tail, redacts it with the same rule as a log line instead of
 * re-deriving one. A string is redacted as the message text it is.
 */
// A logger's serializer is the one place that must read a value's representation: it is handed
// whatever a call site logged, on its way to json. The two checks below are that inspection.
// oxlint-disable anti-slop/no-runtime-typeof
export function redact(
  value: LogValue,
  seen = new WeakSet<object>()
): LogValue {
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
 * The brand that marks a logger this module built. It is the type-level contract that the
 * logger redacts every public binding path, and it is what `forExecution` accepts (R-45).
 */
const REDACTING_LOGGER: unique symbol = Symbol("genie.redacting-logger");

/**
 * The child options the protected logger accepts. Three pino options are removed: `formatters`
 * can replace the structured-object redactor; `serializers` run after that redactor, so one can
 * inject a secret it produced; and `customLevels` installs methods that can overwrite the
 * protected `child` and `setBindings`. Each is also declared `never`, so a pretyped or inferred
 * `ChildLoggerOptions` value carrying one fails assignability and not only an inline literal.
 * `level`, the built-in `redact` and `msgPrefix` remain; a prefix is redacted before delegation.
 */
export type RedactingChildOptions = Omit<
  ChildLoggerOptions,
  "formatters" | "serializers" | "customLevels"
> & {
  formatters?: never;
  serializers?: never;
  customLevels?: never;
};

/**
 * The logger this module hands out. It is declared explicitly, not as `Omit<Logger, ...>`:
 * pino's `Logger` also carries `onChild` and the EventEmitter `on('level-change', ...)` listener,
 * whose callback logger parameters are raw `Logger` values with the original unsafe child
 * overload. Leaving those members out means no callback can hand a caller a raw logger back, and
 * a `RedactingLogger` is not assignable to a pino `Logger` in either direction.
 *
 * It holds pino's logging methods and safe extras a caller may need: the level, the msg prefix,
 * `isLevelEnabled`, `bindings`, the protected `setBindings`, `flush`, the brand, and a `child`
 * that accepts only `RedactingChildOptions` and answers a branded child.
 */
export interface RedactingLogger {
  readonly [REDACTING_LOGGER]: true;

  level: LevelWithSilentOrString;
  fatal: LogFn;
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  silent: LogFn;
  readonly msgPrefix: string | undefined;

  isLevelEnabled(level: LevelWithSilentOrString): boolean;
  bindings(): Bindings;
  setBindings(bindings: Bindings): void;
  flush(callback?: (error?: Error) => void): void;

  child(bindings: Bindings, options?: RedactingChildOptions): RedactingLogger;
}

/**
 * True for a logger this module built. A child is `Object.create(parent)`, so it inherits the
 * brand from the root; a raw pino logger has none.
 */
export function isRedactingLogger(
  value: Logger | RedactingLogger
): value is RedactingLogger {
  // SAFETY: the brand is an optional own property this module puts on the loggers it builds, so
  // a plain read of it answers whether that happened, whatever the caller passed.
  return (
    (value as { readonly [REDACTING_LOGGER]?: true })[REDACTING_LOGGER] === true
  );
}

/** The pino `child` a logger carries, with the `this` its implementation runs against. */
type ChildFactory = (
  this: Logger,
  bindings: Bindings,
  options?: ChildLoggerOptions<never>
) => Logger;

/** The pino `setBindings` a logger carries, with the `this` its implementation runs against. */
type SetBindingsFactory = (this: Logger, bindings: Bindings) => void;

/**
 * The options a protected child may hand to pino. `formatters`, `serializers` and `customLevels`
 * are refused at runtime for a JavaScript caller the type does not cover, and `msgPrefix` is
 * redacted because pino puts it on the line after the argument hook (R-45).
 */
function safeChildOptions(
  options: ChildLoggerOptions<never>
): ChildLoggerOptions<never> {
  if (
    Object.hasOwn(options, "formatters") ||
    Object.hasOwn(options, "serializers") ||
    Object.hasOwn(options, "customLevels")
  ) {
    throw new Error(
      "A redacting logger does not accept child formatters, serializers or customLevels."
    );
  }

  return options.msgPrefix === undefined
    ? options
    : { ...options, msgPrefix: redactText(options.msgPrefix) };
}

/**
 * Reads the object `protectLogger` just finished wrapping as a redacting logger. The brand and
 * both overrides are installed on this same object before the call, which is what the assertion
 * records; the runtime brand is what `isRedactingLogger` checks.
 */
function asRedactingLogger<T extends object>(value: T): RedactingLogger {
  // SAFETY: `protectLogger` installs the brand and replaces `child` and `setBindings` on this
  // object before it reaches here, so it holds the redacting contract this type names.
  return value as RedactingLogger;
}

/**
 * Wraps a pino logger so both public binding paths redact: the bindings a child adds and the
 * bindings `setBindings` adds. pino resets its own `bindings` formatter on a child built without
 * options, so redaction has to happen where the bindings are handed over, not in that formatter.
 *
 * The overrides are own properties of this instance. A child is `Object.create(parent)`, so every
 * child and grandchild inherits them and the whole tree is covered from this one wrap. Each
 * override calls the captured pino function with `this`, so a grandchild keeps the bindings and
 * level of its parents instead of being rebuilt from the root. The brand is non-enumerable, so
 * it never reaches a log line.
 */
function protectLogger(logger: Logger): RedactingLogger {
  const child: ChildFactory = logger.child;
  const setBindings: SetBindingsFactory = logger.setBindings;

  const redactingChild = function redactingChild(
    this: Logger,
    bindings: Bindings,
    options?: ChildLoggerOptions<never>
  ): Logger {
    // SAFETY: pino serializes the bindings as json on the line, so `redact` walks them as the
    // json they become and answers the shape a child takes.
    const safe = redact(bindings as LogValue) as Bindings;

    const safeOptions =
      options === undefined ? undefined : safeChildOptions(options);

    return child.call(this, safe, safeOptions);
  };

  const redactingSetBindings = function redactingSetBindings(
    this: Logger,
    bindings: Bindings
  ): void {
    // SAFETY: pino serializes the bindings as json on the line, so `redact` walks them as the
    // json they become and answers the shape `setBindings` takes.
    const safe = redact(bindings as LogValue) as Bindings;

    setBindings.call(this, safe);
  };

  Object.defineProperty(logger, "child", {
    value: redactingChild,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(logger, "setBindings", {
    value: redactingSetBindings,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(logger, REDACTING_LOGGER, {
    value: true,
    enumerable: false,
  });

  // SAFETY: `protectLogger` installs the brand and both overrides on this object before it
  // reaches here, so it holds the redacting contract this type names.
  return asRedactingLogger(logger);
}

/**
 * The deployment's logger. It writes JSON lines at the level `LOG_LEVEL` names, and every line
 * carries the request, tenant and user ids of the execution that wrote it (R-44).
 *
 * One is built per process from the validated environment, and `publicUrl`, when given, puts
 * the tenant id on every line. A request or a job run takes a child of it through
 * `forExecution`, which adds the request and user ids. A caller that has no environment may pass
 * just the level; `silentLogger` does.
 *
 * With no destination pino builds its own async destination on fd 1, which filters a broken pipe
 * and flushes on exit. A caller that must capture the lines, a test or a pipe, passes its own
 * `DestinationStream`; that is the seam, and production never relies on `process.stdout` being
 * replaced at runtime.
 */
export function createLogger(
  env: Pick<DeploymentEnvironment, "logLevel"> &
    Partial<Pick<DeploymentEnvironment, "publicUrl">>,
  destination?: DestinationStream
): RedactingLogger {
  const options = {
    level: env.logLevel,
    formatters: {
      level: (label: string) => ({ level: label }),
      log: redactLogObject,
    },

    // The formatter above sees the object a call site logged. The message string and every
    // value interpolated into it never reach it, so pino's own argument hook redacts those
    // before the line is built (pino 10 `hooks.logMethod`).
    hooks: {
      logMethod(this: Logger, args: Parameters<LogFn>, method: LogFn): void {
        // A log method takes a message string, values interpolated into it, and an object or
        // an error beside them. Reading which is which is the hook's whole job.
        // oxlint-disable anti-slop/no-runtime-typeof
        // pino takes a leading object as the merging object, which its `log` formatter
        // receives and redacts. Every argument after it is a message or an interpolation
        // value, and those never reach that formatter.
        const merging = args[0] !== null && typeof args[0] === "object";

        const safe = args.map((argument, index) => {
          if (typeof argument === "string") return redactText(argument);

          if (argument instanceof Error) return redactError(argument);

          // The merging object is left to the formatter, which redacts it while keeping an
          // error under `err` an error. An object interpolated into the message has no such
          // path, so it is redacted here instead (R-45).
          if (merging && index === 0) return argument;

          // SAFETY: an interpolation value is whatever a call site logged, and a line holds
          // json, which is the shape `redact` answers.
          return argument !== null && typeof argument === "object"
            ? redact(argument as LogValue)
            : argument;
        });
        // oxlint-enable anti-slop/no-runtime-typeof

        // SAFETY: `map` keeps the argument list of the log method it came from, one redacted
        // string for each string. pino's own type for the hook is that same tuple.
        method.apply(this, safe as Parameters<LogFn>);
      },
    },
  };

  const logger = protectLogger(
    destination === undefined ? pino(options) : pino(options, destination)
  );

  // `PUBLIC_URL` is the tenant id (R-75). Bound on the process logger, so a line written outside
  // any request or job, such as bootstrap or a migration event, still names its tenant.
  if (env.publicUrl !== undefined)
    logger.setBindings({ tenantId: env.publicUrl });

  return logger;
}

/** A command's two line sinks: progress and outcome, and a failure's cause. */
export type LineSinks = {
  readonly output: (line: string) => void;
  readonly errorOutput: (line: string) => void;
};

/**
 * Wraps a process's two line sinks so each line becomes one tenant-bound pino JSON line (R-75):
 * `output` at info, `errorOutput` at error. `genie-ops` and the worker write through these once
 * the environment is valid, so their lines match the application's. A line written before
 * validation has no tenant id to carry and stays plain text on the caller's own sink.
 */
export function jsonLineSinks(
  env: Pick<DeploymentEnvironment, "logLevel" | "publicUrl">,
  sinks: LineSinks
): LineSinks {
  const into = (sink: (line: string) => void) =>
    createLogger(env, {
      write: (line: string) => sink(line.replace(/\n$/, "")),
    });

  const out = into(sinks.output);
  const err = into(sinks.errorOutput);

  return {
    output: (line) => out.info(line),
    errorOutput: (line) => err.error(line),
  };
}

/**
 * A redacting logger that writes nothing. It is for a caller that must supply the required
 * logger but has no destination, such as a test or a test helper. It redacts like every logger
 * this module builds, so it can never leak a secret, and it is not a deployment's logger.
 */
export function silentLogger(): RedactingLogger {
  return createLogger({ logLevel: "silent" });
}

/**
 * The logger of one request or one job run, carrying its three ids. It takes only a logger
 * `createLogger` built, so the whole execution tree redacts (R-45). A raw pino logger has no
 * message redactor, and retrofitting one here would claim a safety it does not have.
 */
export function forExecution(
  logger: RedactingLogger,
  bindings: LogBindings
): RedactingLogger {
  // A caller from JavaScript can pass a raw pino logger the type refuses; it has no redactor.
  if (!isRedactingLogger(logger)) {
    throw new Error("forExecution needs a logger built by createLogger.");
  }

  // A process logger from `createLogger` already binds the tenant id; binding the same id again
  // would write the key twice on every request and job line.
  const { tenantId, ...rest } = bindings;

  return logger.child(
    logger.bindings().tenantId === tenantId ? { ...rest } : { ...bindings }
  );
}
