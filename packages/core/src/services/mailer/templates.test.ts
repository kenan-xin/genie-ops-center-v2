import { describe, expect, it } from "vitest";

import { mailBranding } from "./__fixtures__/branding.ts";
import { mailBrandingTheme } from "./branding.ts";
import { MAIL_TEMPLATE_IDS, renderMailTemplate } from "./templates.tsx";

const ACME = mailBrandingTheme(
  mailBranding({
    companyName: "Acme Security",
    productName: "Acme Ops",
    primaryColor: "#0f766e",
    primaryForeground: "#ffffff",
    emailFooterText: "Acme footer",
  })
);

const GLOBEX = mailBrandingTheme(
  mailBranding({
    companyName: "Globex & <Co>",
    productName: "Globex Ops",
    primaryColor: "#7c2d12",
    primaryForeground: "#fefefe",
    emailFooterText: "Globex footer",
    supportEmail: "help@globex.invalid",
    termsUrl: "https://globex.invalid/terms",
    privacyUrl: "https://globex.invalid/privacy",
  })
);

const BARE = mailBrandingTheme(mailBranding());

const RENAMED = mailBrandingTheme(
  mailBranding({
    companyName: "Renamed Co",
    productName: "Renamed Ops",
    supportEmail: "help@renamed.invalid",
  })
);

/** The HTML part as readable text, so a test can check reading order. */
function htmlText(html: string): string {
  return html
    .replace(/<head>[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
}

/** True when every needle appears, each after the one before it. */
function inOrder(haystack: string, needles: readonly string[]): boolean {
  let from = 0;

  for (const needle of needles) {
    const at = haystack.indexOf(needle, from);

    if (at === -1) return false;

    from = at + needle.length;
  }

  return true;
}

const VARIABLES = {
  deviceName: "Firefox on Linux",
  email: "ada@example.invalid",
  invitationUrl: "https://genie.example.invalid/invite?token=invite-token",
  inviterName: "Grace Hopper",
  link: "https://genie.example.invalid/action?token=action-token",
  message: "A new update is available.",
  moduleName: "Records",
  name: "Ada Lovelace",
  roleName: "Administrator",
};

const TEXT_PARTS = {
  "invitation-brokered": {
    heading: "You are invited",
    action: `Accept invitation: ${VARIABLES.invitationUrl}`,
  },
  "role-granted": {
    heading: "Role granted",
    action: `Open ${ACME.productName}: ${VARIABLES.link}`,
  },
  "role-removed": {
    heading: "Role removed",
    action: `Open ${ACME.productName}: ${VARIABLES.link}`,
  },
  "new-device-sign-in": {
    heading: "New device sign-in",
    action: `Review your account: ${VARIABLES.link}`,
  },
  "module-notification": {
    heading: `${VARIABLES.moduleName} notification`,
    action: `Open ${VARIABLES.moduleName}: ${VARIABLES.link}`,
  },
} satisfies Record<
  (typeof MAIL_TEMPLATE_IDS)[number],
  { readonly heading: string; readonly action: string }
>;

/** Where each template names the product, the company or support, rendered with RENAMED. */
const NAMED = {
  "invitation-brokered": {
    subject: "You are invited to Renamed Ops",
    action: "Accept invitation",
    body: "Grace Hopper invited you to join Renamed Co on Renamed Ops.",
  },
  "role-granted": {
    subject: "You were granted the Administrator role",
    action: "Open Renamed Ops",
    body: "You now have the Administrator role at Renamed Co.",
  },
  "role-removed": {
    subject: "Your Administrator role was removed",
    action: "Open Renamed Ops",
    body: "If you believe this is a mistake, contact help@renamed.invalid.",
  },
  "new-device-sign-in": {
    subject: "New sign-in to Renamed Ops",
    action: "Review your account",
    body: "You received this email because Renamed Ops saw a sign-in from a new device.",
  },
  "module-notification": {
    subject: "Records has an update",
    action: "Open Records",
    body: "You received this email because Renamed Co enabled Records.",
  },
} satisfies Record<
  (typeof MAIL_TEMPLATE_IDS)[number],
  {
    readonly subject: string;
    readonly action: string;
    readonly body: string;
  }
>;

describe("mailer templates", () => {
  it("contains every R-48 template", () => {
    expect(MAIL_TEMPLATE_IDS.toSorted()).toEqual([
      "invitation-brokered",
      "module-notification",
      "new-device-sign-in",
      "role-granted",
      "role-removed",
    ]);
  });

  for (const id of MAIL_TEMPLATE_IDS) {
    it(`renders independent HTML and plain-text parts for ${id}`, async () => {
      const { html, text } = await renderMailTemplate(id, VARIABLES, ACME);

      expect(html).toMatch(/<[a-z][^>]*>/i);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(
        text.startsWith(`${ACME.companyName}\n\n${TEXT_PARTS[id].heading}\n`)
      ).toBe(true);
      expect(text).toContain(`\n\n${TEXT_PARTS[id].action}\n\n`);
      expect(
        html
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      ).not.toBe(text.replace(/\s+/g, " ").trim());
    });

    it(`takes the names in the subject, button and body of ${id} from branding (DR-06)`, async () => {
      const { subject, html, text } = await renderMailTemplate(
        id,
        VARIABLES,
        RENAMED
      );

      expect(subject).toBe(NAMED[id].subject);
      expect(text).toContain(`${NAMED[id].action}: `);
      expect(text).toContain(NAMED[id].body);

      for (const part of [subject, html, text]) {
        expect(part).not.toContain("Genie Ops Center");
      }
    });

    it(`renders ${id} with the branding object, not fixed colors or names (R-59a)`, async () => {
      for (const theme of [ACME, GLOBEX]) {
        // oxlint-disable-next-line no-await-in-loop -- two themes, in order.
        const { html, text } = await renderMailTemplate(id, VARIABLES, theme);

        expect(html).toContain(theme.primaryColor);
        expect(html).toContain(theme.primaryForeground);
        expect(html).not.toContain("#1d4ed8");
        expect(html).not.toContain("<img");
        expect(text).toContain(theme.companyName);

        const order = [
          theme.companyName,
          TEXT_PARTS[id].heading,
          VARIABLES.name,
          id === "invitation-brokered"
            ? VARIABLES.invitationUrl
            : VARIABLES.link,
          theme.footerText ?? "",
          theme.productName,
        ];

        expect(inOrder(text, order)).toBe(true);
        expect(
          inOrder(
            htmlText(html),
            order.map((part) =>
              part
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
            )
          )
        ).toBe(true);
      }
    });
  }

  it("escapes branding text in HTML and keeps it as written in plain text", async () => {
    const { html, text } = await renderMailTemplate(
      "role-granted",
      VARIABLES,
      GLOBEX
    );

    expect(html).toContain("Globex &amp; &lt;Co&gt;");
    expect(html).not.toContain("Globex & <Co>");
    expect(text).toContain("Globex & <Co>");
  });

  it("links support, terms and privacy when the branding sets them", async () => {
    const { html, text } = await renderMailTemplate(
      "role-granted",
      VARIABLES,
      GLOBEX
    );

    for (const url of [
      "mailto:help@globex.invalid",
      GLOBEX.termsUrl,
      GLOBEX.privacyUrl,
    ]) {
      expect(html).toContain(`href="${url}"`);
    }

    expect(text).toContain(`Terms: ${GLOBEX.termsUrl}`);
    expect(text).toContain(`Privacy: ${GLOBEX.privacyUrl}`);
    expect(text).toContain("help@globex.invalid");
  });

  it("drops a terms or privacy link that is not http(s) (tokens L-2)", async () => {
    const { html, text } = await renderMailTemplate("role-granted", VARIABLES, {
      ...GLOBEX,
      termsUrl: "javascript:alert(1)",
    });

    for (const part of [html, text]) {
      expect(part).not.toContain("javascript:");
      expect(part).not.toContain("Terms");
    }

    expect(html).toContain(`href="${GLOBEX.privacyUrl}"`);
  });

  it("leaves out every optional line the branding does not set", async () => {
    const { html, text } = await renderMailTemplate(
      "role-granted",
      VARIABLES,
      BARE
    );

    for (const part of [html, text]) {
      expect(part).not.toMatch(/\bnull\b|\bundefined\b|Terms|Privacy/);
    }

    expect(text).toContain("contact your administrator.");
  });

  it("renders a link on another origin, which only the mailer may refuse", async () => {
    const foreign = "https://support.example.com/accept?token=invite-token";

    const { html, text } = await renderMailTemplate(
      "invitation-brokered",
      { ...VARIABLES, invitationUrl: foreign },
      ACME
    );

    expect(text).toContain(foreign);
    expect(html).toContain(`href="${foreign}"`);
  });
});
