import { describe, expect, it } from "vitest";

import { MAIL_TEMPLATE_IDS, renderMailTemplate } from "./templates.tsx";

const VARIABLES = {
  companyName: "Acme Security",
  deviceName: "Firefox on Linux",
  email: "ada@example.invalid",
  invitationUrl: "https://genie.example.invalid/invite?token=invite-token",
  inviterName: "Grace Hopper",
  link: "https://genie.example.invalid/action?token=action-token",
  message: "A new update is available.",
  moduleName: "Records",
  name: "Ada Lovelace",
  productName: "Genie Ops Center",
  roleName: "Administrator",
  supportEmail: "support@example.invalid",
};

const TEXT_PARTS = {
  "invitation-brokered": {
    heading: "You are invited",
    action: `Accept invitation: ${VARIABLES.invitationUrl}`,
  },
  "role-granted": {
    heading: "Role granted",
    action: `Open ${VARIABLES.productName}: ${VARIABLES.link}`,
  },
  "role-removed": {
    heading: "Role removed",
    action: `Open ${VARIABLES.productName}: ${VARIABLES.link}`,
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
      const { html, text } = await renderMailTemplate(id, VARIABLES);

      expect(html).toMatch(/<[a-z][^>]*>/i);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(text.startsWith(`${TEXT_PARTS[id].heading}\n`)).toBe(true);
      expect(text).toContain(`\n\n${TEXT_PARTS[id].action}\n\n`);
      expect(
        html
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      ).not.toBe(text.replace(/\s+/g, " ").trim());
    });
  }

  it("renders a link on another origin, which only the mailer may refuse", async () => {
    const foreign = "https://support.example.com/accept?token=invite-token";

    const { html, text } = await renderMailTemplate("invitation-brokered", {
      ...VARIABLES,
      invitationUrl: foreign,
    });

    expect(text).toContain(foreign);
    expect(html).toContain(`href="${foreign}"`);
  });
});
