import { describe, expect, it } from "vitest";

import { httpUrl, supportContact } from "./support.ts";

describe("httpUrl", () => {
  it("keeps a trimmed http(s) URL and drops any other scheme (tokens L-2)", () => {
    expect(httpUrl(" https://acme.example/terms ")).toBe(
      "https://acme.example/terms"
    );
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("not a url")).toBeNull();
    expect(httpUrl(null)).toBeNull();
  });
});

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

  it.each([
    "a@b.c?cc=x@y.z",
    "help@acme.example?cc=x",
    "help@acme.example&bcc=x",
    "help@acme.example#x",
    "help%40@acme.example",
    "help@acme.example/x",
    "help:x@acme.example",
  ])(
    "refuses %s, which would add mailto headers or a path (primitives L-3)",
    (supportEmail) => {
      expect(supportContact({ supportEmail, supportUrl: null })).toBeNull();
    }
  );

  it("keeps a plain email", () => {
    expect(
      supportContact({ supportEmail: "help@acme.example", supportUrl: null })
    ).toEqual({ label: "help@acme.example", href: "mailto:help@acme.example" });
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
