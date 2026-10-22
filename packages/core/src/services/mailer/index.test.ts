import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/errors/index.ts";
import { createPublicUrl } from "../../lib/tenant-context/index.ts";
import type { LogValue } from "../logging/index.ts";
import { createLogger, silentLogger } from "../logging/index.ts";
import { mailBranding } from "./__fixtures__/branding.ts";
import { closeServer, startSmtpSink } from "./__fixtures__/smtp-sink.ts";
import type { MailerDependencies, MailerEnvironment } from "./index.ts";
import { createMailer } from "./index.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PUBLIC_URL = "https://genie.example.com";

function developmentEnv(): MailerEnvironment {
  return {
    mailProvider: "none",
    mailFrom: undefined,
    resendApiKey: undefined,
    smtpUrl: undefined,
    runtimeMode: "development",
    publicUrl: PUBLIC_URL,
  };
}

function resendEnv(): MailerEnvironment {
  return {
    mailProvider: "resend",
    mailFrom: "noreply@genie.example.com",
    resendApiKey: "re_test_api_key",
    smtpUrl: undefined,
    runtimeMode: "production",
    publicUrl: PUBLIC_URL,
  };
}

function deps(logger: MailerDependencies["logger"]): MailerDependencies {
  return {
    branding: { get: () => Promise.resolve(mailBranding()) },
    logger,
    publicUrl: createPublicUrl(PUBLIC_URL),
  };
}

/** A logger whose json lines a test reads back, the way a log file would hold them. */
function capturingLogger() {
  const lines: LogValue[] = [];

  const logger = createLogger(
    { logLevel: "info" },
    {
      write(line: string) {
        // SAFETY: the destination receives one pino json line, so parsing it answers the
        // value the line holds.
        lines.push(JSON.parse(line) as LogValue);
      },
    }
  );

  return { logger, lines };
}

/** Sends and hands back the refusal, or fails the test when the send was accepted. */
async function refused(send: () => Promise<void>): Promise<AppError> {
  let caught: unknown;

  try {
    await send();
  } catch (error) {
    caught = error;
  }

  if (caught === undefined) {
    throw new Error("the mailer sent a message it must refuse");
  }

  expect(caught).toBeInstanceOf(AppError);

  // SAFETY: the assertion above checked that the caught value is an AppError.
  return caught as AppError;
}

/** Turns the network off, and answers the one stub, so a test sees any send that leaves. */
function wireOff() {
  const fetchMock = vi.fn(async (_url: RequestInfo, _init?: RequestInit) => {
    throw new Error("the network is off in tests");
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

/** Answers the one response the hosted provider returns for an accepted message. */
function wireAccepting() {
  const fetchMock = vi.fn(
    async (_url: RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { id: "wire-test" } }), {
        status: 200,
      })
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

/** The body the adapter posted for its one call, which carries both rendered parts. */
function wireBody(fetchMock: ReturnType<typeof wireAccepting>): string {
  expect(fetchMock).toHaveBeenCalledTimes(1);

  const [, init] = fetchMock.mock.calls[0] ?? [];

  return String(init?.body ?? "");
}

/** One refused value with the token its query carries, so the test can name both. */
type RefusedLink = {
  readonly name: string;
  readonly value: string;
  readonly token?: string;
};

const REFUSED_LINKS: readonly RefusedLink[] = [
  {
    name: "another host",
    value: "https://other.example/x?token=foreign-1",
    token: "foreign-1",
  },
  {
    name: "another scheme",
    value: "http://genie.example.com/x?token=foreign-2",
    token: "foreign-2",
  },
  {
    name: "another port",
    value: "https://genie.example.com:8443/x?token=foreign-3",
    token: "foreign-3",
  },
  {
    name: "a protocol-relative link",
    value: "//other.example/x?token=foreign-4",
    token: "foreign-4",
  },
  {
    name: "a backslash host",
    value: "/\\other.example/x?token=foreign-5",
    token: "foreign-5",
  },
  { name: "a javascript link", value: "javascript:alert(document.domain)" },
  { name: "a mailto link", value: "mailto:person@example.com" },
  {
    name: "a base-relative absolute link",
    value: "https:evil.example/x?token=foreign-10",
    token: "foreign-10",
  },
  {
    name: "a single-slash absolute link",
    value: "https:/evil.example/?token=foreign-11",
    token: "foreign-11",
  },
  {
    name: "a userinfo link on the public host",
    value: "https://evil.example@genie.example.com/x?token=foreign-12",
    token: "foreign-12",
  },
  {
    name: "a password userinfo link on the public host",
    value: "https://u:p@genie.example.com/x?token=foreign-13",
    token: "foreign-13",
  },
  { name: "a data link", value: "data:text/html,x" },
  { name: "a backslash-pair host", value: "\\\\evil.example" },
  {
    name: "a blob link on the public origin",
    value: "blob:https://genie.example.com/uuid",
  },
];

/** No refused value and no token from its query may reach the error or a line a log holds. */
function expectNoEcho(text: string, link: RefusedLink): void {
  expect(text).not.toContain(link.value);

  if (link.token !== undefined) {
    expect(text).not.toContain(link.token);
  }
}

describe("the mailer's link variables (R-70)", () => {
  it("resolves a path link against PUBLIC_URL and leaves other variables alone", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(developmentEnv(), deps(silentLogger()));

    await mailer.send({
      templateId: "invitation-brokered",
      to: "person@example.com",
      variables: {
        link: "/invite?token=t1",
        invitationUrl: "/finish?token=t2",
        note: "/n",
      },
    });

    // SAFETY: the development path writes one JSON line through process.stdout.write.
    const line = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      tenantId: string;
      variables: Record<string, string>;
    };

    expect(line.tenantId).toBe(PUBLIC_URL);
    expect(line.variables).toEqual({
      link: "https://genie.example.com/invite?token=t1",
      invitationUrl: "https://genie.example.com/finish?token=t2",
      note: "/n",
    });
  });

  it("accepts an absolute link on the PUBLIC_URL origin", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(developmentEnv(), deps(silentLogger()));

    await mailer.send({
      templateId: "new-device-sign-in",
      to: "person@example.com",
      variables: { link: "https://genie.example.com/records?token=own-1" },
    });

    // SAFETY: the development path writes one JSON line through process.stdout.write.
    const line = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      variables: Record<string, string>;
    };

    expect(line.variables.link).toBe(
      "https://genie.example.com/records?token=own-1"
    );
  });

  it("sends an absolute link on the PUBLIC_URL origin through the adapter", async () => {
    const fetchMock = wireAccepting();

    const mailer = createMailer(resendEnv(), deps(silentLogger()));

    await mailer.send({
      templateId: "new-device-sign-in",
      to: "person@example.com",
      variables: { link: "https://genie.example.com/records?token=own-1" },
    });

    expect(wireBody(fetchMock)).toContain(
      "https://genie.example.com/records?token=own-1"
    );
  });

  it("leaves a foreign link the rule does not own alone", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(developmentEnv(), deps(silentLogger()));

    await mailer.send({
      templateId: "module-notification",
      to: "person@example.com",
      variables: {
        link: "/records?token=own-2",
        message: "Read the policy at https://policy.example/page",
      },
    });

    // SAFETY: the development path writes one JSON line through process.stdout.write.
    const line = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      variables: Record<string, string>;
    };

    expect(line.variables.link).toBe(
      "https://genie.example.com/records?token=own-2"
    );
    expect(line.variables.message).toBe(
      "Read the policy at https://policy.example/page"
    );
  });

  it("refuses one foreign link even when the other is a valid path", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(developmentEnv(), deps(silentLogger()));

    const error = await refused(() =>
      mailer.send({
        templateId: "invitation-brokered",
        to: "person@example.com",
        variables: {
          link: "/invite?token=t1",
          invitationUrl: "https://other.example/x",
          note: "/n",
        },
      })
    );

    expect(error.code).toBe("mail-link-origin");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(REFUSED_LINKS)(
    "refuses $name on the link variable and sends nothing",
    async (link) => {
      const fetchMock = wireOff();

      const { logger, lines } = capturingLogger();

      const mailer = createMailer(resendEnv(), deps(logger));

      const error = await refused(() =>
        mailer.send({
          templateId: "new-device-sign-in",
          to: "person@example.com",
          variables: { link: link.value },
        })
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(error.code).toBe("mail-link-origin");
      expect(error.message).toContain("link");
      expectNoEcho(error.message, link);

      for (const line of lines) {
        expectNoEcho(JSON.stringify(line), link);
      }
    }
  );

  it("refuses a foreign link on the invitationUrl variable and names it", async () => {
    const link: RefusedLink = {
      name: "invitationUrl",
      value: "https://other.example/accept?token=foreign-8",
      token: "foreign-8",
    };

    const fetchMock = wireOff();

    const { logger, lines } = capturingLogger();

    const mailer = createMailer(resendEnv(), deps(logger));

    const error = await refused(() =>
      mailer.send({
        templateId: "invitation-brokered",
        to: "person@example.com",
        variables: { invitationUrl: link.value },
      })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error.code).toBe("mail-link-origin");
    expect(error.message).toContain("invitationUrl");
    expectNoEcho(error.message, link);

    for (const line of lines) {
      expectNoEcho(JSON.stringify(line), link);
    }
  });

  it("refuses an unrooted relative link and sends nothing", async () => {
    const link: RefusedLink = {
      name: "unrooted",
      value: "records/42?token=foreign-9",
      token: "foreign-9",
    };

    const fetchMock = wireOff();

    const { logger, lines } = capturingLogger();

    const mailer = createMailer(resendEnv(), deps(logger));

    const error = await refused(() =>
      mailer.send({
        templateId: "module-notification",
        to: "person@example.com",
        variables: { link: link.value },
      })
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(error.code).toBe("mail-link-origin");
    expect(error.message).toContain("link");
    expectNoEcho(error.message, link);

    for (const line of lines) {
      expectNoEcho(JSON.stringify(line), link);
    }
  });

  it("normalises an absolute link before the adapter sends it", async () => {
    const fetchMock = wireAccepting();

    const mailer = createMailer(resendEnv(), deps(silentLogger()));

    await mailer.send({
      templateId: "new-device-sign-in",
      to: "person@example.com",
      variables: {
        link: "https://genie.example.com\\@evil.example/?token=own-3",
      },
    });

    const body = wireBody(fetchMock);

    expect(body).toContain(
      "https://genie.example.com/@evil.example/?token=own-3"
    );
    expect(body).not.toContain("genie.example.com\\@evil.example");
  });

  it("normalises a path link that carries leading whitespace", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(developmentEnv(), deps(silentLogger()));

    await mailer.send({
      templateId: "new-device-sign-in",
      to: "person@example.com",
      variables: { link: "  /invite?token=own-4" },
    });

    // SAFETY: the development path writes one JSON line through process.stdout.write.
    const line = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      variables: Record<string, string>;
    };

    expect(line.variables.link).toBe(
      "https://genie.example.com/invite?token=own-4"
    );
  });

  it("keeps the PUBLIC_URL path prefix when it rebuilds a path link", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(developmentEnv(), {
      branding: { get: () => Promise.resolve(mailBranding()) },
      logger: silentLogger(),
      publicUrl: createPublicUrl("https://genie.example.com/ops"),
    });

    await mailer.send({
      templateId: "module-notification",
      to: "person@example.com",
      variables: { link: "/../x?token=1#h" },
    });

    // SAFETY: the development path writes one JSON line through process.stdout.write.
    const line = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      variables: Record<string, string>;
    };

    expect(line.variables.link).toBe(
      "https://genie.example.com/ops/x?token=1#h"
    );
  });

  it("cannot build a mailer dependency set without a public URL", () => {
    // @ts-expect-error publicUrl is required, so no action link can be sent unverified.
    const incomplete: MailerDependencies = {
      branding: { get: () => Promise.resolve(mailBranding()) },
      logger: silentLogger(),
    };

    expect(incomplete.branding).toBeDefined();
  });
});

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

function smtpEnv(smtpUrl: string): MailerEnvironment {
  return {
    mailProvider: "smtp",
    mailFrom: "mailer@example.invalid",
    resendApiKey: undefined,
    smtpUrl,
    runtimeMode: "production",
    publicUrl: PUBLIC_URL,
  };
}

function brandedDeps(
  logger: MailerDependencies["logger"],
  emailSenderName: string | null = "Acme Security"
): MailerDependencies {
  return {
    branding: {
      get: () =>
        Promise.resolve(mailBranding({ companyName: "Acme", emailSenderName })),
    },
    logger,
    publicUrl: createPublicUrl(PUBLIC_URL),
  };
}

describe("the mailer's delivery", () => {
  it("refuses an unconfigured production mailer before a caller writes, and on send", async () => {
    const fetchMock = wireOff();

    const mailer = createMailer(
      { ...developmentEnv(), runtimeMode: "production" },
      deps(silentLogger())
    );

    // requireConfigured is the gate an action calls before it creates a row (R-45).
    expect(() => mailer.requireConfigured()).toThrow(
      expect.objectContaining({ code: "mail-not-configured" })
    );

    const error = await refused(() =>
      mailer.send({
        templateId: "new-device-sign-in",
        to: "person@example.com",
        variables: { link: "/records" },
      })
    );

    expect(error.code).toBe("mail-not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders each send with the branding the reader returns at that moment (R-59a)", async () => {
    const fetchMock = wireAccepting();

    let row = mailBranding({
      companyName: "First Co",
      primaryColor: "#0f766e",
      primaryForeground: "#ffffff",
      emailFooterText: "First footer",
    });

    const mailer = createMailer(resendEnv(), {
      branding: { get: () => Promise.resolve(row) },
      logger: silentLogger(),
      publicUrl: createPublicUrl(PUBLIC_URL),
    });

    const send = () =>
      mailer.send({
        templateId: "new-device-sign-in",
        to: "person@example.com",
        variables: { link: "/records" },
      });

    await send();
    row = { ...row, companyName: "Second Co" };
    await send();

    // SAFETY: the Resend adapter posts one JSON body per message.
    const [first, second] = fetchMock.mock.calls.map(
      ([, init]) =>
        JSON.parse(String(init?.body)) as { html: string; text: string }
    );

    expect(first?.html).toContain("#0f766e");
    expect(first?.html).toContain("First footer");
    expect(first?.text).toContain("First Co");
    expect(second?.text).toContain("Second Co");
  });

  it.each([
    { case: "an invalid recipient", to: "not-an-email" },
    {
      case: "a comma-joined recipient list",
      to: "ada@example.invalid, grace@example.invalid",
    },
  ])("refuses $case before sending", async ({ to }) => {
    const fetchMock = wireAccepting();

    const mailer = createMailer(resendEnv(), deps(silentLogger()));

    const error = await refused(() =>
      mailer.send({ templateId: "new-device-sign-in", to, variables: {} })
    );

    expect(error.code).toBe("invalid-input");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("quotes comma and address-like sender names as exactly one From address", async () => {
    const sink = await startSmtpSink();

    try {
      const expected = [
        { name: "Acme, Inc", header: '"Acme, Inc" <mailer@example.invalid>' },
        {
          name: "Acme <x@evil>,",
          header: '"Acme <x@evil>," <mailer@example.invalid>',
        },
      ];

      for (const sender of expected) {
        // oxlint-disable-next-line no-await-in-loop -- one message per sender, in order.
        await createMailer(
          smtpEnv(sink.url),
          brandedDeps(silentLogger(), sender.name)
        ).send({
          templateId: "new-device-sign-in",
          to: "ada@example.invalid",
          variables: { link: "/records" },
        });
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
    } finally {
      await closeServer(sink.server);
    }
  });

  it("sets Reply-To from the branding reply-to address, and leaves it out when unset (R-55)", async () => {
    const sink = await startSmtpSink();

    try {
      for (const emailReplyTo of ["replies@acme.invalid", null]) {
        // oxlint-disable-next-line no-await-in-loop -- one message per branding row, in order.
        await createMailer(smtpEnv(sink.url), {
          branding: {
            get: () => Promise.resolve(mailBranding({ emailReplyTo })),
          },
          logger: silentLogger(),
          publicUrl: createPublicUrl(PUBLIC_URL),
        }).send({
          templateId: "new-device-sign-in",
          to: "ada@example.invalid",
          variables: { link: "/records" },
        });
      }

      const replyTo = sink.messages.map(
        (message) => message.match(/^Reply-To:\s*(.+)$/im)?.[1]
      );

      expect(replyTo).toEqual(["replies@acme.invalid", undefined]);
    } finally {
      await closeServer(sink.server);
    }
  });

  // R-49: a provider's rejection can echo the message, including a path-segment token the
  // redactor cannot see, so the failure line carries the code and status only, at every level.
  it.each([
    {
      link: "query-token link",
      url: `${PUBLIC_URL}/invite?token=query-token-secret`,
      token: "query-token-secret",
    },
    {
      link: "path-token link",
      url: `${PUBLIC_URL}/invite/path-token-secret`,
      token: "path-token-secret",
    },
  ])(
    "never logs an SMTP failure reply containing a $link at any level",
    async ({ url, token }) => {
      const sink = await startSmtpSink({
        dataFailureReply: `554 5.7.1 rejected link ${url}`,
      });

      try {
        // oxlint-disable no-await-in-loop -- each level gets its own logger and send, in order.
        for (const logLevel of LOG_LEVELS) {
          const chunks: string[] = [];

          const logger = createLogger(
            { logLevel },
            { write: (line: string) => void chunks.push(line) }
          );

          const stdout = vi.spyOn(process.stdout, "write");

          const stderr = vi.spyOn(process.stderr, "write");

          const error = await refused(() =>
            createMailer(smtpEnv(sink.url), brandedDeps(logger)).send({
              templateId: "invitation-brokered",
              to: "ada@example.invalid",
              variables: { link: url, invitationUrl: url },
            })
          );

          const combined = [
            ...chunks,
            ...stdout.mock.calls.map(([chunk]) => String(chunk)),
            ...stderr.mock.calls.map(([chunk]) => String(chunk)),
          ].join("");

          stdout.mockRestore();
          stderr.mockRestore();

          // The thrown error is the safe catalogue error: neither the link nor the reply.
          expect(error.code).toBe("mail-delivery-failed");
          expect(String(error)).not.toContain(token);
          expect(combined).not.toContain(url);
          expect(combined).not.toContain(token);

          // A mailer that logged nothing would pass the checks above, so pin the failure line at
          // every level that emits an error (all but the two quiet ones).
          if (logLevel !== "fatal" && logLevel !== "silent") {
            expect(combined).toContain("mail-delivery-failed");
          }
        }
        // oxlint-enable no-await-in-loop
      } finally {
        await closeServer(sink.server);
      }
    }
  );
});
