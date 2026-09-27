import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../../lib/errors/index.ts";
import { createPublicUrl } from "../../lib/tenant-context/index.ts";
import type { LogValue } from "../logging/index.ts";
import { createLogger, silentLogger } from "../logging/index.ts";
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
    branding: {
      get: () => Promise.resolve({ companyName: "Co", emailSenderName: null }),
    },
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
});
