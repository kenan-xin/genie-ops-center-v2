import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";

import type { DestinationStream } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import type { TenantContext } from "../src/lib/tenant-context/index.ts";
import { tenantBranding } from "../src/schema.ts";
import { createLogger } from "../src/services/logging/index.ts";
import {
  migrationPlan,
  runMigrations,
} from "../src/services/migrator/index.ts";
import { startDisposablePostgres } from "./index.ts";

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

const PATH_LINK = "https://genie.example.invalid/invite/path-token-secret";

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

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

async function mailerContext(
  mail: Omit<MailerSource, "DATABASE_URL" | "PUBLIC_URL" | "MAIL_FROM"> & {
    MAIL_FROM?: string;
  } = {},
  emailSenderName: string | null = BRANDING.emailSenderName,
  captured = captureLoggerStream()
) {
  const postgres = await startDisposablePostgres();

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

  cleanups.push(async () => {
    await context.db.$client.end();
    await postgres.stop();
  });

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan([]),
    compiledModuleIds: [],
  });

  await context.db
    .insert(tenantBranding)
    .values({ ...BRANDING, emailSenderName });

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

async function startSmtpSink(
  options: { readonly dataFailureReply?: string } = {}
): Promise<{
  readonly server: Server;
  readonly url: string;
  readonly messages: string[];
  readonly recipients: string[];
}> {
  const messages: string[] = [];
  const recipients: string[] = [];

  const server = createServer((socket: Socket) => {
    let buffered = "";
    let message = "";
    let readingMessage = false;
    socket.write("220 local.test ESMTP\r\n");

    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");

      while (buffered.includes("\r\n")) {
        const end = buffered.indexOf("\r\n");
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);

        if (readingMessage) {
          if (line === ".") {
            messages.push(message);
            message = "";
            readingMessage = false;
            socket.write("250 queued\r\n");
          } else {
            message += `${line}\r\n`;
          }
        } else if (/^EHLO\b|^HELO\b/i.test(line)) {
          socket.write("250-local.test\r\n250 PIPELINING\r\n");
        } else if (/^DATA\b/i.test(line)) {
          if (options.dataFailureReply === undefined) {
            readingMessage = true;
            socket.write("354 end with dot\r\n");
          } else {
            socket.write(`${options.dataFailureReply}\r\n`);
          }
        } else if (/^RCPT TO:/i.test(line)) {
          recipients.push(line);
          socket.write("250 recipient ok\r\n");
        } else if (/^QUIT\b/i.test(line)) {
          socket.write("221 bye\r\n");
        } else {
          socket.write("250 ok\r\n");
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  // SAFETY: this server listens on an explicit TCP host and ephemeral port.
  const address: AddressInfo = server.address() as AddressInfo;

  return {
    server,
    url: `smtp://127.0.0.1:${address.port}`,
    messages,
    recipients,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

describe("mailer adapters and tenant context", () => {
  it("selects SMTP and sends both parts from the branded MAIL_FROM through the SMTP sink", async () => {
    const sink = await startSmtpSink();

    cleanups.push(() => closeServer(sink.server));

    const { context } = await mailerContext({
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

    const { context } = await mailerContext({
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

  it("rejects an unconfigured production send before a caller creates a row", async () => {
    await withNodeEnvironment("production", async () => {
      const { context } = await mailerContext();
      const mailer = mailerOf(context);

      await context.db.$client.query(
        "create table mailer_action_probe (id int)"
      );

      expect(mailer).toBeDefined();

      const action = async () => {
        await mailer.requireConfigured();
        await context.db.$client.query(
          "insert into mailer_action_probe values (1)"
        );
      };

      let directError: unknown;

      try {
        await mailer.requireConfigured();
      } catch (error) {
        directError = error;
      }

      expect(directError).toMatchObject({ code: "mail-not-configured" });

      await expect(action()).rejects.toMatchObject({
        code: "mail-not-configured",
      });

      const result = await context.db.$client.query<{ count: string }>(
        "select count(*)::text as count from mailer_action_probe"
      );

      expect(result.rows[0]?.count).toBe("0");
    });
  });

  it("logs the development message and full working link rather than sending it", async () => {
    await withNodeEnvironment("development", async () => {
      const captured = captureLoggerStream();
      const { context, logger } = await mailerContext({}, undefined, captured);
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

  it("never logs an SMTP failure reply containing a query-token link at any level", async () => {
    await assertSmtpFailureLinkIsNotLogged(QUERY_LINK, "query-token-secret");
  });

  it("never logs an SMTP failure reply containing a path-token link at any level", async () => {
    await assertSmtpFailureLinkIsNotLogged(PATH_LINK, "path-token-secret");
  });

  async function assertSmtpFailureLinkIsNotLogged(
    tokenizedLink: string,
    token: string
  ) {
    const sink = await startSmtpSink({
      dataFailureReply: `554 5.7.1 rejected link ${tokenizedLink}`,
    });

    cleanups.push(() => closeServer(sink.server));

    await withNodeEnvironment("production", async () => {
      // Each level gets a destination created before the context and the send.
      // oxlint-disable no-await-in-loop
      for (const logLevel of LOG_LEVELS) {
        const captured = captureLoggerStream();

        const { context, logger } = await mailerContext(
          {
            MAIL_PROVIDER: "smtp",
            SMTP_URL: sink.url,
            LOG_LEVEL: logLevel,
          },
          undefined,
          captured
        );

        const mailer = mailerOf(context);

        captured.proveCapture(logger);
        captured.clear();

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

        expect(value).toBeInstanceOf(Error);

        if (!(value instanceof Error)) return;

        expect(value.message).toContain(tokenizedLink);
        expect(`${captured.output()}${output}`).not.toContain(tokenizedLink);
        expect(`${captured.output()}${output}`).not.toContain(token);
      }
      // oxlint-enable no-await-in-loop
    });
  }

  it("quotes comma and address-like sender names as exactly one From address", async () => {
    const sink = await startSmtpSink();
    cleanups.push(() => closeServer(sink.server));

    const expected = [
      { name: "Acme, Inc", header: '"Acme, Inc" <mailer@example.invalid>' },
      {
        name: "Acme <x@evil>,",
        header: '"Acme <x@evil>," <mailer@example.invalid>',
      },
    ];

    for (const sender of expected) {
      // The contexts use the same local sink but fresh validated branding.
      // oxlint-disable-next-line no-await-in-loop
      const { context } = await mailerContext(
        {
          MAIL_PROVIDER: "smtp",
          SMTP_URL: sink.url,
        },
        sender.name
      );

      // oxlint-disable-next-line no-await-in-loop
      await mailerOf(context).send(MAIL);
    }

    const fromHeaders = sink.messages.map(
      (message) => message.match(/^From:\s*(.+)$/im)?.[1]
    );

    expect(fromHeaders).toEqual(expected.map(({ header }) => header));
    expect(
      sink.messages.every(
        (message) => (message.match(/^From:/gim) ?? []).length === 1
      )
    ).toBe(true);
  });

  it("refuses an invalid recipient before sending", async () => {
    const requests: string[] = [];

    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      requests.push(String(input));

      return new Response(JSON.stringify({ id: "mail_test_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { context } = await mailerContext({
      MAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_api_key",
    });

    await expect(
      mailerOf(context).send({ ...MAIL, to: "not-an-email" })
    ).rejects.toThrow();

    expect(requests).toHaveLength(0);
  });

  it("refuses a comma-joined recipient list before sending", async () => {
    const requests: string[] = [];

    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      requests.push(String(input));

      return new Response(JSON.stringify({ id: "mail_test_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const { context } = await mailerContext({
      MAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_api_key",
    });

    await expect(
      mailerOf(context).send({
        ...MAIL,
        to: "ada@example.invalid, grace@example.invalid",
      })
    ).rejects.toThrow();

    expect(requests).toHaveLength(0);
  });
});
