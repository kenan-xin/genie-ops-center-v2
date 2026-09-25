import { describe, expect, it } from "vitest";

import { MAIL_TEMPLATE_IDS, renderMailTemplate } from "./templates.ts";

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

describe("mailer templates", () => {
  it("contains every R-48 template and both invitation variants", () => {
    expect(MAIL_TEMPLATE_IDS.toSorted()).toEqual([
      "invitation-brokered",
      "invitation-local-account",
      "module-notification",
      "new-device-sign-in",
      "role-granted",
      "role-removed",
    ]);
  });

  for (const id of MAIL_TEMPLATE_IDS) {
    it(`renders independent HTML and plain-text parts for ${id}`, () => {
      const { html, text } = renderMailTemplate(id, VARIABLES);

      expect(html).toMatch(/<[a-z][^>]*>/i);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
      expect(
        html
          .replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim()
      ).not.toBe(text.replace(/\s+/g, " ").trim());
    });
  }
});
