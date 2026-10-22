import type { DestinationStream } from "pino";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { tenantBranding } from "../src/schema.ts";
import { createLogger } from "../src/services/logging/index.ts";
import {
  closeServer,
  startSmtpSink,
} from "../src/services/mailer/__fixtures__/smtp-sink.ts";
import {
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { type DisposablePostgres, startDisposablePostgres } from "./index.ts";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const BRANDING = {
  companyName: "Acme",
  productName: "Genie Ops Center",
  defaultLocale: "en",
  defaultTimeZone: "UTC",
  emailSenderName: "Acme Security",
};

const MAIL = {
  templateId: "invitation-brokered" as const,
  to: "ada@example.invalid",
  variables: {
    name: "Ada Lovelace",
    email: "ada@example.invalid",
    companyName: BRANDING.companyName,
    productName: BRANDING.productName,
    invitationUrl:
      "https://genie.example.invalid/invite?token=invite-token-secret",
    link: "https://genie.example.invalid/invite?token=invite-token-secret",
    roleName: "Administrator",
    deviceName: "Firefox on Linux",
    moduleName: "Records",
    message: "A new update is available.",
  },
};

const QUERY_LINK =
  "https://genie.example.invalid/invite?token=query-token-secret";

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

type MailerSource = {
  DATABASE_URL: string;
  PUBLIC_URL: string;
  MAIL_FROM: string;
  MAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  SMTP_URL?: string;
  LOG_LEVEL?: string;
};

function captureLoggerStream() {
  const chunks: string[] = [];

  const destination: DestinationStream = {
    write(chunk) {
      chunks.push(chunk);
    },
  };

  return {
    destination,
    output: () => chunks.join(""),
    clear() {
      chunks.length = 0;
    },
    proveCapture(logger: ReturnType<typeof createLogger>) {
      const previousLevel = logger.level;
      logger.level = "trace";

      try {
        logger.info(
          { captureControl: "mailer-test" },
          "mailer-capture-control"
        );
      } finally {
        logger.level = previousLevel;
      }

      expect(chunks.join("")).toContain("mailer-capture-control");
    },
  };
}

/**
 * One migrated database with the branding row, shared by the file. Every case builds its own
 * context over it and only reads the branding, so no case depends on another's writes.
 */
let postgres: DisposablePostgres;

beforeAll(async () => {
  postgres = await startDisposablePostgres();

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://genie.example.invalid",
    },
    createLogger({ logLevel: "silent" }, { write: () => {} }),
    []
  );

  try {
    await runMigrations({
      env: context.env,
      pool: context.db.$client,
      histories: migrationPlan([]),
      compiledModuleIds: [],
    });

    await context.db.insert(tenantBranding).values(BRANDING);
  } finally {
    await context.db.$client.end();
  }
}, 120000);

afterAll(async () => {
  // A failed start leaves this unset, and calling through it would replace the real error.
  await postgres?.stop();
});

function mailerContext(
  mail: Omit<MailerSource, "DATABASE_URL" | "PUBLIC_URL" | "MAIL_FROM"> & {
    MAIL_FROM?: string;
  } = {},
  captured = captureLoggerStream()
) {
  const logger = createLogger(
    { logLevel: mail.LOG_LEVEL ?? "info" },
    captured.destination
  );

  const context = createTenantContext(
    {
      DATABASE_URL: postgres.url,
      PUBLIC_URL: "https://genie.example.invalid",
      MAIL_FROM: "mailer@example.invalid",
      ...mail,
    },
    logger,
    []
  );

  cleanups.push(() => context.db.$client.end());

  return { context, captured, logger };
}

async function withNodeEnvironment<T>(
  value: string,
  run: () => Promise<T>
): Promise<T> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;

  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

async function captureConsoleOutput<T>(
  run: () => Promise<T>
): Promise<{ readonly value: T; readonly output: string }> {
  const writes: string[] = [];

  const capture = (chunk: string | Uint8Array): boolean => {
    writes.push(Buffer.from(chunk).toString("utf8"));

    return true;
  };

  // SAFETY: stream.write passes its written chunk as the first argument.
  const captureWrite = capture as typeof process.stdout.write;

  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(captureWrite);

  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(captureWrite);

  try {
    const value = await run();

    return { value, output: writes.join("") };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

describe("mailer adapters and tenant context", () => {
  it("selects SMTP and sends both parts from the branded MAIL_FROM through the SMTP sink", async () => {
    const sink = await startSmtpSink();

    cleanups.push(() => closeServer(sink.server));

    const { context } = mailerContext({
      MAIL_PROVIDER: "smtp",
      SMTP_URL: sink.url,
      MAIL_FROM: "mailer@example.invalid",
    });

    const mailer = mailerOf(context);

    expect(mailer).toBeDefined();
    expect(mailer.provider).toBe("smtp");
    await mailer.send({ ...MAIL, templateId: "invitation-brokered" });

    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0]).toMatch(
      /From:.*Acme Security.*<mailer@example\.invalid>/i
    );
    expect(sink.messages[0]).toContain("Content-Type: text/html");
    expect(sink.messages[0]).toContain("Content-Type: text/plain");
  });

  it("selects Resend and submits the complete message without a network request", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];

    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(input), init });

        return new Response(JSON.stringify({ id: "mail_test_1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    );

    const { context } = mailerContext({
      MAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_api_key",
      MAIL_FROM: "mailer@example.invalid",
    });

    const mailer = mailerOf(context);

    expect(mailer).toBeDefined();
    expect(mailer.provider).toBe("resend");
    await mailer.send({ ...MAIL, templateId: "invitation-brokered" });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://api.resend.com/emails");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      from: "Acme Security <mailer@example.invalid>",
      to: [MAIL.to],
      html: expect.stringContaining("Ada Lovelace"),
      text: expect.stringContaining("Ada Lovelace"),
    });
  });

  it("refuses an unconfigured production send without logging the link", async () => {
    await withNodeEnvironment("production", async () => {
      const captured = captureLoggerStream();
      const { context, logger } = mailerContext({}, captured);
      const mailer = mailerOf(context);

      captured.proveCapture(logger);
      captured.clear();

      const tokenizedLink = QUERY_LINK;

      const { value, output } = await captureConsoleOutput(async () => {
        try {
          await mailer.send({
            ...MAIL,
            variables: {
              ...MAIL.variables,
              link: tokenizedLink,
              invitationUrl: tokenizedLink,
            },
          });
        } catch (error) {
          return error;
        }

        return undefined;
      });

      expect(value).toMatchObject({ code: "mail-not-configured" });

      const combined = `${captured.output()}${output}`;

      expect(combined).not.toContain(tokenizedLink);
      expect(combined).not.toContain("query-token-secret");
    });
  });

  it("logs the development message and full working link rather than sending it", async () => {
    await withNodeEnvironment("development", async () => {
      const captured = captureLoggerStream();
      const { context, logger } = mailerContext({}, captured);
      const mailer = mailerOf(context);
      const fetch = vi.fn();

      expect(mailer).toBeDefined();

      captured.proveCapture(logger);
      captured.clear();
      vi.stubGlobal("fetch", fetch);

      const { value, output } = await captureConsoleOutput(() =>
        mailer.send({ ...MAIL, templateId: "invitation-brokered" })
      );

      const fullOutput = captured.output() + output;

      expect(value).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
      expect(fullOutput).toContain(MAIL.to);
      expect(fullOutput).toContain(MAIL.variables.invitationUrl);
    });
  });
});
