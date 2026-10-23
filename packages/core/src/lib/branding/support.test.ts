import { describe, expect, it } from "vitest";

import { supportContact } from "./support.ts";

describe("supportContact", () => {
  it("lets a valid email win over a URL", () => {
    expect(
      supportContact({
        supportEmail: " help@acme.example ",
        supportUrl: "https://support.acme.example",
      })
    ).toEqual({ label: "help@acme.example", href: "mailto:help@acme.example" });
  });

  it("falls back to the URL when the email is blank or holds a space", () => {
    const url = "https://support.acme.example";

    expect(supportContact({ supportEmail: "   ", supportUrl: url })).toEqual({
      label: url,
      href: url,
    });
    expect(
      supportContact({ supportEmail: "help me@acme.example", supportUrl: url })
    ).toEqual({ label: url, href: url });
  });

  it("refuses a javascript: URL", () => {
    expect(
      supportContact({ supportEmail: null, supportUrl: "javascript:alert(1)" })
    ).toBeNull();
  });

  it("answers null for two blank values", () => {
    expect(supportContact({ supportEmail: " ", supportUrl: null })).toBeNull();
    expect(supportContact({ supportEmail: null, supportUrl: "  " })).toBeNull();
  });
});
