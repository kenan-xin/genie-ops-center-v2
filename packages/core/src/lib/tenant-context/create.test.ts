import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKSPACE_ROOT, probe } from "../../__testing__/target-probe.ts";
import { silentLogger } from "../../services/logging/index.ts";
import type { TenantContext } from "./index.ts";
import { createPublicUrl, createTenantContext } from "./index.ts";

type MailerContract = {
  readonly provider: "none" | "resend" | "smtp";
  readonly requireConfigured: () => void | Promise<void>;
  readonly send: (input: {
    readonly templateId: string;
    readonly to: string;
    readonly variables: Readonly<Record<string, string>>;
  }) => Promise<void>;
};

function mailerOf(context: TenantContext): MailerContract {
  // SAFETY: S1-08 adds this fixed member to the context contract.
  return (context as TenantContext & { readonly mailer: MailerContract })
    .mailer;
}

const MINIMAL = {
  DATABASE_URL: "postgres://genie:secret@db.invalid:5432/genie",
  PUBLIC_URL: "https://genie.example.com",
};

const NODE = process.execPath;

const PRELOAD = join(
  WORKSPACE_ROOT,
  "packages/core/src/lib/build-safety/detect-initialization.ts"
);

const CORE_MODULES = join(WORKSPACE_ROOT, "packages/core/node_modules");

type Report = { readonly connections: readonly string[] };

/** Runs one entry file under the initialization detectors and reads its report. */
function runProbe(source: string) {
  const result = probe(
    [
      { path: "package.json", source: `{\n  "type": "module"\n}\n` },
      { path: "entry.ts", source },
    ],
    NODE,
    ["--experimental-strip-types", "--import", PRELOAD, "entry.ts"],
    CORE_MODULES
  );

  const report: Report = JSON.parse(
    readFileSync(join(result.root, "probe-report.json"), "utf8")
  );

  return { failed: result.failed, report };
}

describe("createPublicUrl (R-70)", () => {
  it("keeps a path prefix on PUBLIC_URL and refuses a path without a leading slash", () => {
    const publicUrl = createPublicUrl("https://genie.example.com/ops/");

    expect(publicUrl("/invite", { token: "a b" })).toBe(
      "https://genie.example.com/ops/invite?token=a+b"
    );
    expect(publicUrl("//evil.example/x")).toBe(
      "https://genie.example.com/ops//evil.example/x"
    );
    expect(() => publicUrl("invite")).toThrow("must start with");
    expect(() => publicUrl("/invite?token=x")).toThrow(
      'must not hold "?" or "#"'
    );
    expect(() => publicUrl("/invite#top")).toThrow('must not hold "?" or "#"');
  });
});

describe("createTenantContext", () => {
  it("holds the fixed members and three readers and nothing else (R-18)", async () => {
    const context = createTenantContext(MINIMAL, silentLogger(), []);

    try {
      expect(Object.keys(context).toSorted()).toEqual([
        "authRequestScope",
        "branding",
        "capabilities",
        "correlationScope",
        "db",
        "entitlements",
        "env",
        "events",
        "fileStorage",
        "jobQueue",
        "mailer",
        "publicUrl",
        "settings",
      ]);
      expect(context.env.databaseUrl).toBe(MINIMAL.DATABASE_URL);
      expect(context.env.lockTimeoutMs).toBe(120000);
      expect(mailerOf(context)).toBeDefined();
      expect(mailerOf(context).provider).toBe("none");
    } finally {
      await context.db.$client.end();
    }
  });

  it("builds the mailer once from the validated environment", async () => {
    const source = {
      ...MINIMAL,
      MAIL_FROM: "mailer@example.invalid",
      MAIL_PROVIDER: "smtp",
      SMTP_URL: "smtp://mail.invalid",
    };

    const context = createTenantContext(source, silentLogger(), []);
    const mailer = mailerOf(context);

    source.MAIL_PROVIDER = "resend";

    try {
      expect(mailer.provider).toBe("smtp");
      expect(mailerOf(context)).toBe(mailer);
    } finally {
      await context.db.$client.end();
    }
  });

  it("gives each call its own pool, so two contexts share nothing", async () => {
    const first = createTenantContext(MINIMAL, silentLogger(), []);
    const second = createTenantContext(MINIMAL, silentLogger(), []);

    try {
      expect(first.db).not.toBe(second.db);
      expect(first.db.$client).not.toBe(second.db.$client);
    } finally {
      await Promise.all([first.db.$client.end(), second.db.$client.end()]);
    }
  });

  it("keeps an error listener on the pool, so an idle client's failure cannot exit the process", async () => {
    // pg-pool emits `error` on the Pool itself when an idle client dies, and Node turns an
    // `error` event with no listener into an uncaught exception. The checked-out listener is
    // per client and cannot contain that one (genie-ops-center-v2-akh).
    const context = createTenantContext(MINIMAL, silentLogger(), []);

    try {
      expect(context.db.$client.listenerCount("error")).toBeGreaterThan(0);
    } finally {
      await context.db.$client.end();
    }
  });

  it("bounds the pool connection wait above the migrator lock wait (dm9)", async () => {
    const context = createTenantContext(MINIMAL, silentLogger(), []);

    try {
      // Above the default lock wait, so a concurrent migrator waiting out the advisory lock is
      // never failed early; finite, so a database that accepts TCP and never answers cannot hold
      // a pooled client forever.
      expect(
        context.db.$client.options.connectionTimeoutMillis
      ).toBeGreaterThan(context.env.lockTimeoutMs);
    } finally {
      await context.db.$client.end();
    }
  });

  it("refuses an invalid environment and names the variable", () => {
    expect(() =>
      createTenantContext(
        { PUBLIC_URL: MINIMAL.PUBLIC_URL },
        silentLogger(),
        []
      )
    ).toThrow("DATABASE_URL");
  });

  it("refuses to build a context with an unimplemented s3 adapter", () => {
    expect(() =>
      createTenantContext(
        { ...MINIMAL, FILE_STORAGE_ADAPTER: "s3" },
        silentLogger(),
        []
      )
    ).toThrow(/s3.*not implemented/i);
  });

  it("opens no connection while building the context", () => {
    // The pool is lazy: a connection belongs to the first query, and to the
    // migrator's own reserved client, never to the factory (R-19).
    const run = runProbe(`
import { createTenantContext } from ${JSON.stringify(
      join(WORKSPACE_ROOT, "packages/core/src/lib/tenant-context/index.ts")
    )};
import { silentLogger } from ${JSON.stringify(
      join(WORKSPACE_ROOT, "packages/core/src/services/logging/index.ts")
    )};

const context = createTenantContext(${JSON.stringify(MINIMAL)}, silentLogger(), []);

await context.db.$client.end();
`);

    expect(run.failed).toBe(false);
    expect(run.report.connections).toEqual([]);
  });

  it("opens no connection when the environment is refused", () => {
    const run = runProbe(`
import { createTenantContext } from ${JSON.stringify(
      join(WORKSPACE_ROOT, "packages/core/src/lib/tenant-context/index.ts")
    )};
import { silentLogger } from ${JSON.stringify(
      join(WORKSPACE_ROOT, "packages/core/src/services/logging/index.ts")
    )};

try {
  createTenantContext({ PUBLIC_URL: "https://genie.example.com" }, silentLogger(), []);
} catch {
  console.log("refused");
}
`);

    expect(run.failed).toBe(false);
    expect(run.report.connections).toEqual([]);
  });
});
