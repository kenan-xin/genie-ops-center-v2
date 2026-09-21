import { describe, expect, it } from "vitest";

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
