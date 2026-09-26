import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicUrl } from "../../lib/tenant-context/index.ts";
import { silentLogger } from "../logging/index.ts";
import { createMailer } from "./index.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the mailer's link variables (R-70)", () => {
  it("resolves a path link against PUBLIC_URL and leaves other variables alone", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const mailer = createMailer(
      {
        mailProvider: "none",
        mailFrom: undefined,
        resendApiKey: undefined,
        smtpUrl: undefined,
        runtimeMode: "development",
        publicUrl: "https://genie.example.com",
      },
      {
        branding: {
          get: () =>
            Promise.resolve({ companyName: "Co", emailSenderName: null }),
        },
        logger: silentLogger(),
        publicUrl: createPublicUrl("https://genie.example.com"),
      }
    );

    await mailer.send({
      templateId: "invitation-brokered",
      to: "person@example.com",
      variables: {
        link: "/invite?token=t1",
        invitationUrl: "https://other.example/x",
        note: "/n",
      },
    });

    // SAFETY: the development path writes one JSON line through process.stdout.write.
    const line = JSON.parse(String(write.mock.calls[0]?.[0])) as {
      tenantId: string;
      variables: Record<string, string>;
    };

    expect(line.tenantId).toBe("https://genie.example.com");
    expect(line.variables).toEqual({
      link: "https://genie.example.com/invite?token=t1",
      invitationUrl: "https://other.example/x",
      note: "/n",
    });
  });
});
