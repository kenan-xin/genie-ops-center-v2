import { pino } from "pino";
import type { ChildLoggerOptions, Logger } from "pino";
import { describe, expect, it } from "vitest";

import {
  AppError,
  CORE_ERROR_MESSAGES,
  CORE_ERRORS,
} from "../../lib/errors/index.ts";
import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";
import type {
  LogBindings,
  LogValue,
  RedactingChildOptions,
  RedactingLogger,
} from "./index.ts";
import {
  REDACTED,
  createLogger,
  forExecution,
  isRedactingLogger,
} from "./index.ts";
import { LEVEL_VALUES } from "./line-rules.ts";

/**
 * The identity formatter a call site would use to replace pino's structured-object redactor.
 * The contextual type gives the parameter its shape, so no broad explicit annotation is written.
 */
const identityLogFormatter: NonNullable<
  NonNullable<ChildLoggerOptions["formatters"]>["log"]
> = (value) => value;

/** A serializer that passes its value through, which pino applies after the redactor. */
const identitySerializer: NonNullable<
  ChildLoggerOptions["serializers"]
>[string] = (value) => value;

/**
 * Reaches the runtime guard the way a JavaScript caller would: it builds raw pino child options
 * and presents them to the protected child, which the static boundary already refuses.
 */
function rawChildOptions(options: ChildLoggerOptions): RedactingChildOptions {
  // SAFETY: a JavaScript caller can pass raw pino options; this cast only reproduces that at the
  // runtime boundary this test exercises.
  return options as RedactingChildOptions;
}

const ENV: DeploymentEnvironment = {
  databaseUrl: "postgres://genie:secret@db:5432/genie",
  publicUrl: "https://genie.example.com",
  fileStorageAdapter: "postgres",
  fileMaxBytes: 15728640,
  chatAllowedOrigins: [],
  authTrustedProxies: [],
  lockTimeoutMs: 120000,
  logLevel: "info",
  port: 3000,
  runtimeMode: "production",
  mailProvider: "none",
  mailFrom: undefined,
  resendApiKey: undefined,
  smtpUrl: undefined,
};

/** Captures the lines one logger writes, so a test reads what a log file would hold. */
function capture() {
  const lines: LogValue[] = [];

  const destination = {
    write(line: string) {
      lines.push(JSON.parse(line));
    },
  };

  return { lines, destination };
}

describe("the shared line rules", () => {
  it("use pino's own level numbers, so the preload filters like the core logger", () => {
    expect(Object.fromEntries(LEVEL_VALUES)).toEqual({
      ...pino({ level: "silent" }).levels.values,
      silent: Number.POSITIVE_INFINITY,
    });
  });
});

describe("the logger", () => {
  it("writes json lines at the level the environment names", () => {
    const { lines, destination } = capture();
    const logger = createLogger({ ...ENV, logLevel: "warn" }, destination);

    logger.info("below the level");
    logger.warn("at the level");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "warn", msg: "at the level" });
  });

  it("carries the request, tenant and user ids on every line", () => {
    const { lines, destination } = capture();

    const logger = forExecution(createLogger(ENV, destination), {
      requestId: "r1",
      correlationId: "r1",
      tenantId: "t1",
      userId: "u1",
    });

    logger.info("one");
    logger.error("two");

    for (const line of lines) {
      expect(line).toMatchObject({
        requestId: "r1",
        tenantId: "t1",
        userId: "u1",
      });
    }
  });

  it("writes the tenant id once when the process logger already binds it", () => {
    const raw: string[] = [];

    forExecution(
      createLogger(ENV, { write: (line: string) => raw.push(line) }),
      {
        requestId: "r1",
        correlationId: "r1",
        tenantId: ENV.publicUrl,
        userId: "u1",
      }
    ).info("one");

    expect(raw[0]?.match(/"tenantId"/g)).toHaveLength(1);
    expect(JSON.parse(raw[0] ?? "")).toMatchObject({
      tenantId: ENV.publicUrl,
      requestId: "r1",
    });
  });

  it("names an unauthenticated caller rather than inventing a user", () => {
    const { lines, destination } = capture();

    forExecution(createLogger(ENV, destination), {
      requestId: "r1",
      correlationId: "r1",
      tenantId: "t1",
      userId: "anonymous",
    }).info("sign-in page");

    expect(lines[0]).toMatchObject({ userId: "anonymous" });
  });

  it("redacts a secret whatever the call site passes", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({
      password: "hunter2",
      apiKey: "sk-live-1",
      databaseUrl: ENV.databaseUrl,
    });

    expect(lines[0]).toMatchObject({
      password: REDACTED,
      apiKey: REDACTED,
      databaseUrl: REDACTED,
    });

    expect(JSON.stringify(lines[0])).not.toContain("hunter2");
  });

  it("redacts a secret nested several levels down", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({
      request: {
        headers: {
          authorization: "Bearer abc.def",
          accept: "application/json",
        },
        body: { user: { credentials: { password: "hunter2" } } },
      },
    });

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("Bearer");
    expect(written).not.toContain("hunter2");
    expect(written).toContain("application/json");
  });

  it("redacts a secret inside an array", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({
      attempts: [{ token: "t-1" }, { token: "t-2" }],
    });

    expect(JSON.stringify(lines[0])).not.toContain("t-1");
  });

  it("redacts an emailed link that carries a token", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({
      setPasswordLink: "https://genie.example.com/set-password?token=abc123",
      helpLink: "https://genie.example.com/help",
    });

    expect(lines[0]).toMatchObject({
      setPasswordLink: REDACTED,
      helpLink: "https://genie.example.com/help",
    });
  });

  it("redacts a url carrying a credential in its userinfo", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({
      upstream: "https://user:hunter2@service.example.com/health",
    });

    expect(JSON.stringify(lines[0])).not.toContain("hunter2");
  });

  // Every case below reads the serialized line the destination received, not the redactor's
  // return value, and each secret is a made-up value that exists only inside this file.
  it("redacts a token link passed as the message itself", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "https://genie.example.com/set-password?token=abc123"
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
    expect(lines[0]).toMatchObject({ msg: REDACTED });
  });

  it("redacts a token link inside a longer message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).warn(
      "sent https://genie.example.com/invite?token=abc123 to one person"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("to one person");
  });

  it("redacts a secret interpolated into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "reset link %s",
      "https://genie.example.com/reset?token=abc123"
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("redacts a bare token pair in a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info("callback failed for token=abc123");

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  // A message and its interpolated values reach the line through pino's own formatting, which
  // never passes the log formatter, so every case below is redacted before pino formats it.
  it("redacts a secret in an object interpolated into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info("payload %j", {
      password: "hunter2",
      apiKey: "sk-live-1",
      attempt: 2,
    });

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).not.toContain("sk-live-1");
    expect(written).toContain("payload");
    expect(written).toContain("attempt");
  });

  it("redacts a secret nested in an object interpolated with %o", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info("state %o", {
      session: { authorization: "Bearer abc.def" },
      region: "eu-west-1",
    });

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("Bearer");
    expect(written).not.toContain("abc.def");
    expect(written).toContain("eu-west-1");
  });

  it("redacts an object interpolated beside a merging object", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({ requestId: "r1" }, "payload %j", {
      password: "hunter2",
    });

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).toContain("r1");
    expect(written).toContain("payload");
  });

  it("leaves the interpolated object it was given unchanged", () => {
    const { destination } = capture();

    const payload = { password: "hunter2" };

    createLogger(ENV, destination).info("payload %j", payload);

    expect(payload.password).toBe("hunter2");
  });

  it("redacts an error interpolated into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).warn(
      "call failed %o",
      new Error("upstream https://db.example.com/reset?token=abc123")
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("redacts an authorization header written into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "rejected Authorization: Bearer abc.def.ghi"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc.def.ghi");
    expect(written).not.toContain("Bearer");
    expect(written).toContain("Authorization");
  });

  // A credential can reach a message without a header name or a `name=value` pair in front of
  // it: a call site writes `Bearer <token>` on its own, or quotes a header line. The scheme
  // word names how the credential is presented, so it may stay; the token never does (R-45).
  it("redacts a bare bearer credential written into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).warn(
      "upstream rejected Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(written).not.toContain("abc123");
    expect(written).toContain("[redacted]");
  });

  it("redacts a bearer credential in an authorization header line", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "rejected Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(written).not.toContain("abc123");
    expect(written).toContain("Authorization");
  });

  it("redacts a lowercase bearer credential in an authorization header line", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "rejected authorization: bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(written).not.toContain("abc123");
    expect(written).toContain("authorization");
  });

  it("leaves an ordinary sentence that uses the word bearer alone", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info("the bearer of bad news");

    expect(lines[0]).toMatchObject({ msg: "the bearer of bad news" });
  });

  it("redacts a cookie header written into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "sent Cookie: session=abc123; theme=dark"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("Cookie");
  });

  it("redacts a credential in a non-http url inside a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).error(
      "connect failed for postgres://genie:abc123@db:5432/genie"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("connect failed");
  });

  it("redacts a non-http url credential inside an error", () => {
    const { lines, destination } = capture();

    const wrapped = new Error("the core history did not apply", {
      cause: new Error("connect postgres://genie:abc123@db:5432/genie refused"),
    });

    createLogger(ENV, destination).error(wrapped);

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("the core history did not apply");
  });

  it("leaves a credential-free non-http url alone", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "the pool for postgres://db:5432/genie is open"
    );

    expect(lines[0]).toMatchObject({
      msg: "the pool for postgres://db:5432/genie is open",
    });
  });

  it("redacts a token link inside a logged error", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).error(
      new Error("fetch failed: https://upstream.example.com/api?key=abc123")
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("keeps a redacted cause chain, which is the diagnosis a reader needs", () => {
    const { lines, destination } = capture();

    const driver = new Error(
      "connect ECONNREFUSED db.internal:5432, retry https://db.example.com/reset?token=abc123"
    );

    const wrapped = new Error("the core history did not apply", {
      cause: driver,
    });

    createLogger(ENV, destination).error(wrapped);

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("the core history did not apply");
    expect(written).toContain("ECONNREFUSED");
  });

  it("keeps the cause of an AppError, whose fields are not writable", () => {
    const { lines, destination } = capture();

    const cause = new Error("pg: password authentication failed for genie");
    const error = new AppError(CORE_ERRORS["migration-failed"], { cause });

    createLogger(ENV, destination).error(error);

    const written = JSON.stringify(lines[0]);

    expect(written).toContain("password authentication failed");
    expect(written).toContain(CORE_ERROR_MESSAGES["migration-failed"]);
    expect(error.safeMessage).toBe(CORE_ERROR_MESSAGES["migration-failed"]);
  });

  it("keeps the kind and the code of an AppError logged on its own", () => {
    const { lines, destination } = capture();

    const cause = new Error(
      "pg auth failed, see https://db.example.com/r?token=abc123"
    );

    createLogger(ENV, destination).error(
      new AppError(CORE_ERRORS["migration-failed"], { cause })
    );

    expect(lines[0]).toMatchObject({
      err: {
        type: "AppError",
        code: "migration-failed",
        safeMessage: CORE_ERROR_MESSAGES["migration-failed"],
      },
    });

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("pg auth failed");
  });

  it("redacts a secret field a custom error carries", () => {
    const { lines, destination } = capture();

    const failure = Object.assign(new Error("upstream refused"), {
      password: "hunter2",
      endpoint: "https://upstream.example.com/call?key=abc123",
      status: 401,
    });

    createLogger(ENV, destination).error(failure);

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).not.toContain("abc123");
    expect(written).toContain("401");
  });

  // The four shapes a call site can log an error in. Each one reaches the same redaction.
  it("redacts an error given in the object form, which no hook sees", () => {
    const { lines, destination } = capture();

    const failure = Object.assign(new Error("upstream refused"), {
      password: "hunter2",
      endpoint: "https://upstream.example.com/call?key=abc123",
      status: 401,
    });

    createLogger(ENV, destination).error({ err: failure }, "the call failed");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).not.toContain("abc123");
    expect(written).toContain("401");
    expect(written).toContain("upstream refused");
    expect(failure.password).toBe("hunter2");
  });

  it("keeps an AppError's kind and code in the object form too", () => {
    const { lines, destination } = capture();

    const error = new AppError(CORE_ERRORS["migration-failed"], {
      cause: new Error(
        "pg auth failed, see https://db.example.com/r?token=abc123"
      ),
    });

    createLogger(ENV, destination).error({ err: error }, "the start failed");

    expect(lines[0]).toMatchObject({
      err: { type: "AppError", code: "migration-failed" },
    });

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("pg auth failed");
  });

  it("redacts an error nested under a name of the call site's choosing", () => {
    const { lines, destination } = capture();

    const failure = Object.assign(new Error("upstream refused"), {
      token: "abc123",
      status: 502,
    });

    createLogger(ENV, destination).warn({ attempt: { failure } }, "retrying");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("502");
    expect(written).toContain("upstream refused");
  });

  it("survives a cause that points back at its own error", () => {
    const { lines, destination } = capture();

    const first = new Error("first");
    const second = new Error("second", { cause: first });

    Object.defineProperty(first, "cause", { value: second, writable: true });

    createLogger(ENV, destination).error(second);

    expect(JSON.stringify(lines[0])).toContain("second");
  });

  it("leaves the error it was given unchanged", () => {
    const { destination } = capture();

    const original = new Error(
      "link https://genie.example.com/reset?token=abc123"
    );

    createLogger(ENV, destination).error(original);

    expect(original.message).toContain("abc123");
  });

  it("leaves an ordinary message and an ordinary link alone", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "opened https://genie.example.com/help for the reader"
    );

    expect(lines[0]).toMatchObject({
      msg: "opened https://genie.example.com/help for the reader",
    });
  });

  it("survives an object that holds itself", () => {
    const { lines, destination } = capture();

    // SAFETY: the field starts empty and is filled with the object itself on the next line,
    // which is the loop under test. The annotation only widens `undefined` to the json type.
    const loop = { name: "loop", self: undefined as LogValue };

    loop.self = loop;

    createLogger(ENV, destination).info(loop);

    expect(lines[0]).toMatchObject({ name: "loop" });
  });

  // A child logger is a normal supported pino path, not an internal detail, so its bindings
  // pass the same redactor the rest of the logger uses (R-45).
  it("redacts a secret in a child logger's bindings", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination)
      .child({ password: "hunter2", authorization: "Bearer abc.def" })
      .info("child line");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).not.toContain("abc.def");
    expect(written).toContain("child line");
  });

  it("redacts a nested secret in a child logger's bindings", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination)
      .child({ request: { headers: { authorization: "Bearer abc.def" } } })
      .info("child line");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc.def");
  });

  it("redacts bindings added on a grandchild logger", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination)
      .child({ tenantId: "t1" })
      .child({ apiKey: "sk-live-1" })
      .info("deep line");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("sk-live-1");
    expect(written).toContain("t1");
  });

  it("redacts a secret written with setBindings", () => {
    const { lines, destination } = capture();

    const logger = createLogger(ENV, destination);

    logger.setBindings({
      password: "hunter2",
      authorization: "Bearer abc.def",
      tenantId: "t1",
    });
    logger.info("set bindings line");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).not.toContain("abc.def");
    expect(written).toContain("t1");
  });

  it("redacts a secret written with setBindings on a child logger", () => {
    const { lines, destination } = capture();

    const child = createLogger(ENV, destination).child({ tenantId: "t1" });

    child.setBindings({ apiKey: "sk-live-1" });
    child.info("child set bindings line");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("sk-live-1");
    expect(written).toContain("t1");
  });

  it("leaves the setBindings object it was given unchanged", () => {
    const { destination } = capture();

    const logger = createLogger(ENV, destination);
    const bindings = { password: "hunter2" };

    logger.setBindings(bindings);

    expect(bindings.password).toBe("hunter2");
  });

  it("brands only the loggers createLogger built", () => {
    const { destination } = capture();

    const logger: RedactingLogger = createLogger(ENV, destination);

    expect(isRedactingLogger(logger)).toBe(true);
    expect(isRedactingLogger(logger.child({ tenantId: "t1" }))).toBe(true);
    expect(isRedactingLogger(pino({ level: "info" }, destination))).toBe(false);
  });

  it("refuses a raw pino logger, which has no message redactor", () => {
    const { destination } = capture();
    const raw = pino({ level: "info" }, destination);

    const ids: LogBindings = {
      requestId: "r1",
      correlationId: "r1",
      tenantId: "t1",
      userId: "u1",
    };

    // @ts-expect-error a raw pino logger is not a RedactingLogger; the brand is the contract.
    const call = () => forExecution(raw, ids);

    expect(call).toThrow();
  });

  it("rejects child options that would replace the redactor or its operations", () => {
    const { lines, destination } = capture();
    const logger = createLogger(ENV, destination);

    expect(() =>
      logger.child(
        { scope: "probe" },
        rawChildOptions({ formatters: { log: identityLogFormatter } })
      )
    ).toThrow(/formatters, serializers or customLevels/);

    expect(() =>
      logger.child(
        { scope: "probe" },
        rawChildOptions({ serializers: { password: identitySerializer } })
      )
    ).toThrow(/formatters, serializers or customLevels/);

    // A custom level named `child` or `setBindings` would overwrite the protected wrapper on the
    // branded child. Both must be refused before pino installs them.
    expect(() =>
      logger.child(
        { scope: "probe" },
        rawChildOptions({ customLevels: { child: 35 } })
      )
    ).toThrow(/formatters, serializers or customLevels/);

    expect(() =>
      logger.child(
        { scope: "probe" },
        rawChildOptions({ customLevels: { setBindings: 35 } })
      )
    ).toThrow(/formatters, serializers or customLevels/);

    expect(lines).toHaveLength(0);
  });

  it("refuses unsafe child options at the type boundary, inline and pretyped", () => {
    const { destination } = capture();
    const logger = createLogger(ENV, destination);

    const call = () =>
      logger.child(
        { scope: "probe" },
        {
          // @ts-expect-error a redacting child does not accept formatters.
          formatters: { log: identityLogFormatter },
        }
      );

    const serializerCall = () =>
      logger.child(
        { scope: "probe" },
        {
          // @ts-expect-error a redacting child does not accept serializers.
          serializers: { password: identitySerializer },
        }
      );

    const customLevelCall = () =>
      logger.child(
        { scope: "probe" },
        {
          // @ts-expect-error a redacting child does not accept customLevels.
          customLevels: { child: 35 },
        }
      );

    const pretyped: ChildLoggerOptions = {
      level: "info",
      formatters: { log: identityLogFormatter },
    };

    const pretypedCall = () =>
      logger.child(
        { scope: "probe" },
        // @ts-expect-error a pretyped ChildLoggerOptions carrying formatters is not accepted.
        pretyped
      );

    const inferred = { level: "info", customLevels: { setBindings: 35 } };

    const inferredCall = () =>
      logger.child(
        { scope: "probe" },
        // @ts-expect-error an inferred options value carrying customLevels is not accepted.
        inferred
      );

    expect(call).toThrow();
    expect(serializerCall).toThrow();
    expect(customLevelCall).toThrow();
    expect(pretypedCall).toThrow();
    expect(inferredCall).toThrow();
  });

  it("does not expose pino callbacks that would hand a raw logger back", () => {
    const { destination } = capture();
    const logger = createLogger(ENV, destination);

    // @ts-expect-error a protected logger is not assignable to a raw pino Logger.
    const widened: Logger = logger;

    // @ts-expect-error the protected surface does not expose onChild.
    logger.onChild = (child: Logger) => {
      child.child({}, { formatters: { log: identityLogFormatter } });
    };

    // @ts-expect-error the protected surface does not expose level-change listeners.
    logger.on(
      "level-change",
      (
        _label: string,
        _value: number,
        _previousLabel: string,
        _previousValue: number,
        raw: Logger
      ) => {
        raw.child({}, { serializers: { password: identitySerializer } });
      }
    );

    expect(widened).toBeDefined();
  });

  it("redacts a credential written in a child message prefix", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination)
      .child({ scope: "probe" }, { msgPrefix: "Authorization: Bearer abc123 " })
      .info("line");

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).toContain("line");
  });

  it("redacts structured secrets through a child and forExecution", () => {
    const { lines, destination } = capture();

    const child = createLogger(ENV, destination).child({ scope: "probe" });

    const execution = forExecution(child, {
      requestId: "r1",
      correlationId: "r1",
      tenantId: "t1",
      userId: "u1",
    });

    execution.info({ password: "hunter2", safe: "kept" }, "probe");

    expect(isRedactingLogger(child)).toBe(true);
    expect(isRedactingLogger(execution)).toBe(true);

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("hunter2");
    expect(written).toContain("kept");
    expect(written).toContain("scope");
  });

  it("leaves the child bindings it was given unchanged", () => {
    const { destination } = capture();

    const bindings = { password: "hunter2" };

    createLogger(ENV, destination).child(bindings);

    expect(bindings.password).toBe("hunter2");
  });

  it("redacts a digest authorization header written into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      'rejected Authorization: Digest username="genie", response=abc123'
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).not.toContain("Digest");
    expect(written).toContain("Authorization");
  });

  it("redacts a negotiate authorization header written into a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "rejected Authorization: Negotiate abc123"
    );

    const written = JSON.stringify(lines[0]);

    expect(written).not.toContain("abc123");
    expect(written).not.toContain("Negotiate");
  });

  it("redacts an access_token query parameter in a logged link", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info({
      next: "https://genie.example.com/callback?access_token=abc123",
    });

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("redacts a client_secret query parameter in a logged link", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).warn(
      "callback https://upstream.example.com/token?client_secret=abc123 failed"
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("classifies a query name case-insensitively like a structured field", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "https://upstream.example.com/token?Access_Token=abc123"
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("redacts a bare access_token pair in a message", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "callback failed for access_token=abc123"
    );

    expect(JSON.stringify(lines[0])).not.toContain("abc123");
  });

  it("leaves a non-secret query parameter alone", () => {
    const { lines, destination } = capture();

    createLogger(ENV, destination).info(
      "opened https://genie.example.com/list?page=2&sort=name"
    );

    expect(lines[0]).toMatchObject({
      msg: "opened https://genie.example.com/list?page=2&sort=name",
    });
  });
});
