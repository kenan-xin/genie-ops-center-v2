import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./index.ts";

const MINIMAL = {
  DATABASE_URL: "postgres://genie:secret@db:5432/genie",
  PUBLIC_URL: "https://genie.example.com",
};

describe("validateEnvironment", () => {
  it("reads the two required values of the Section 0 profile", () => {
    const env = validateEnvironment(MINIMAL);

    expect(env.databaseUrl).toBe(MINIMAL.DATABASE_URL);
    expect(env.publicUrl).toBe(MINIMAL.PUBLIC_URL);
  });

  it("applies every documented default", () => {
    const env = validateEnvironment(MINIMAL);

    expect(env.fileStorageAdapter).toBe("postgres");
    expect(env.fileMaxBytes).toBe(15728640);
    expect(env.chatAllowedOrigins).toEqual([]);
    expect(env.authTrustedProxies).toEqual([]);
    expect(env.lockTimeoutMs).toBe(120000);
    expect(env.logLevel).toBe("info");
    expect(env.port).toBe(3000);
  });

  it("refuses a missing database url and names the variable", () => {
    expect(() =>
      validateEnvironment({ PUBLIC_URL: MINIMAL.PUBLIC_URL })
    ).toThrow("DATABASE_URL");
  });

  it("refuses a database url that is not postgres", () => {
    expect(() =>
      validateEnvironment({ ...MINIMAL, DATABASE_URL: "mysql://db/genie" })
    ).toThrow("DATABASE_URL");
  });

  it("refuses a public url that is not a url", () => {
    expect(() =>
      validateEnvironment({ ...MINIMAL, PUBLIC_URL: "genie.example.com" })
    ).toThrow("PUBLIC_URL");
  });

  it("reports every broken value at once, not the first", () => {
    const message = failureOf({ DATABASE_URL: "", PUBLIC_URL: "" });

    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("PUBLIC_URL");
  });

  it("never repeats a secret it rejected", () => {
    const secret = "mysql://genie:hunter2@db:5432/genie";
    const message = failureOf({ ...MINIMAL, DATABASE_URL: secret });

    expect(message).not.toContain("hunter2");
  });

  // DEC-44: a larger upload than the default needs a bucket behind it.
  it("refuses an upload limit above the default on the database adapter", () => {
    expect(() =>
      validateEnvironment({ ...MINIMAL, FILE_MAX_BYTES: "20000000" })
    ).toThrow("FILE_MAX_BYTES");
  });

  it("allows an upload limit above the default on the s3 adapter", () => {
    const env = validateEnvironment({
      ...MINIMAL,
      FILE_STORAGE_ADAPTER: "s3",
      FILE_MAX_BYTES: "20000000",
    });

    expect(env.fileMaxBytes).toBe(20000000);
  });

  it("parses a list and validates each entry", () => {
    const env = validateEnvironment({
      ...MINIMAL,
      GENIE_CHAT_API_ALLOWED_ORIGINS:
        "https://a.example.com, https://b.example.com",
    });

    expect(env.chatAllowedOrigins).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it.each([
    "http://a.example.com",
    "https://",
    "https://a.example.com/chat",
    "https://a.example.com?key=1",
    "https://user:pass@a.example.com",
    "not a url",
    "a.example.com",
  ])("refuses the chat origin %s", (origin) => {
    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        GENIE_CHAT_API_ALLOWED_ORIGINS: origin,
      })
    ).toThrow("GENIE_CHAT_API_ALLOWED_ORIGINS");
  });

  it.each([
    "https://a.example.com",
    "https://a.example.com/",
    "https://a.example.com:8443",
  ])("accepts the chat origin %s", (origin) => {
    const env = validateEnvironment({
      ...MINIMAL,
      GENIE_CHAT_API_ALLOWED_ORIGINS: origin,
    });

    expect(env.chatAllowedOrigins).toEqual([origin]);
  });

  it.each([
    "0.0.0.0/0",
    "::/0",
    "not-an-ip",
    "10.0.0.1/33",
    "10.0.0.300",
    "10.0.0.1/",
    "10.0.0.1/8/8",
    "https://proxy.example.com",
  ])("refuses the trusted proxy %s", (proxy) => {
    expect(() =>
      validateEnvironment({ ...MINIMAL, AUTH_TRUSTED_PROXIES: proxy })
    ).toThrow("AUTH_TRUSTED_PROXIES");
  });

  it.each(["10.0.0.1", "10.0.0.0/8", "fd00::1", "fd00::/8"])(
    "accepts the trusted proxy %s",
    (proxy) => {
      const env = validateEnvironment({
        ...MINIMAL,
        AUTH_TRUSTED_PROXIES: proxy,
      });

      expect(env.authTrustedProxies).toEqual([proxy]);
    }
  );

  it("refuses a list where only one entry is malformed", () => {
    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        AUTH_TRUSTED_PROXIES: "10.0.0.0/8, not-an-ip",
      })
    ).toThrow("AUTH_TRUSTED_PROXIES");
  });

  it("refuses a lock timeout that is not a positive whole number", () => {
    expect(() =>
      validateEnvironment({ ...MINIMAL, LOCK_TIMEOUT_MS: "0" })
    ).toThrow("LOCK_TIMEOUT_MS");

    expect(() =>
      validateEnvironment({ ...MINIMAL, LOCK_TIMEOUT_MS: "soon" })
    ).toThrow("LOCK_TIMEOUT_MS");
  });

  it("refuses a log level pino does not have", () => {
    expect(() =>
      validateEnvironment({ ...MINIMAL, LOG_LEVEL: "chatty" })
    ).toThrow("LOG_LEVEL");
  });

  it("refuses a port outside the range", () => {
    expect(() => validateEnvironment({ ...MINIMAL, PORT: "70000" })).toThrow(
      "PORT"
    );
  });

  it("ignores a variable of a later section", () => {
    const env = validateEnvironment({
      ...MINIMAL,
      KEYCLOAK_URL: "https://id.example.com",
      BETTER_AUTH_SECRET: "x".repeat(32),
    });

    expect(Object.keys(env).toSorted()).toEqual([
      "authTrustedProxies",
      "chatAllowedOrigins",
      "databaseUrl",
      "fileMaxBytes",
      "fileStorageAdapter",
      "lockTimeoutMs",
      "logLevel",
      "mailFrom",
      "mailProvider",
      "port",
      "publicUrl",
      "resendApiKey",
      "smtpUrl",
    ]);
  });

  it("reads an unset mail provider as no mailer", () => {
    const env = validateEnvironment(MINIMAL);

    expect(env.mailProvider).toBe("none");
    expect(env.mailFrom).toBeUndefined();
    expect(env.resendApiKey).toBeUndefined();
    expect(env.smtpUrl).toBeUndefined();
  });

  it("reads the resend provider and its key", () => {
    const env = validateEnvironment({
      ...MINIMAL,
      MAIL_PROVIDER: "resend",
      MAIL_FROM: "mailer@example.invalid",
      RESEND_API_KEY: "re_test_key",
    });

    expect(env.mailProvider).toBe("resend");
    expect(env.mailFrom).toBe("mailer@example.invalid");
    expect(env.resendApiKey).toBe("re_test_key");
  });

  it("reads the smtp provider and its url", () => {
    const env = validateEnvironment({
      ...MINIMAL,
      MAIL_PROVIDER: "smtp",
      MAIL_FROM: "mailer@example.invalid",
      SMTP_URL: "smtps://mailer:secret@mail.example.invalid:465",
    });

    expect(env.mailProvider).toBe("smtp");
    expect(env.smtpUrl).toBe("smtps://mailer:secret@mail.example.invalid:465");
  });

  it("refuses a provider without a sender address", () => {
    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        MAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test_key",
      })
    ).toThrow("MAIL_FROM");
  });

  it("refuses the credential a provider needs and names the variable", () => {
    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        MAIL_PROVIDER: "resend",
        MAIL_FROM: "mailer@example.invalid",
      })
    ).toThrow("RESEND_API_KEY");

    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        MAIL_PROVIDER: "smtp",
        MAIL_FROM: "mailer@example.invalid",
      })
    ).toThrow("SMTP_URL");
  });

  it("refuses a provider name and an smtp url it does not know", () => {
    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        MAIL_PROVIDER: "sendgrid",
      })
    ).toThrow("MAIL_PROVIDER");

    expect(() =>
      validateEnvironment({
        ...MINIMAL,
        MAIL_PROVIDER: "smtp",
        MAIL_FROM: "mailer@example.invalid",
        SMTP_URL: "https://mail.example.invalid",
      })
    ).toThrow("SMTP_URL");
  });
});

/** The message of the failure a broken environment raises. */
function failureOf(source: Record<string, string | undefined>): string {
  try {
    validateEnvironment(source);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("the environment was accepted");
}
