import { describe, expect, it } from "vitest";

import {
  AppError,
  CORE_ERROR_MESSAGES,
  CORE_ERRORS,
} from "../../lib/errors/index.ts";
import type { DeploymentEnvironment } from "../../lib/tenant-context/index.ts";
import type { LogValue } from "./index.ts";
import { REDACTED, createLogger, forExecution } from "./index.ts";

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

  it("names an unauthenticated caller rather than inventing a user", () => {
    const { lines, destination } = capture();

    forExecution(createLogger(ENV, destination), {
      requestId: "r1",
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
});
