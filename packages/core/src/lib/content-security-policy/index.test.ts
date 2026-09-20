import { describe, expect, it } from "vitest";

import {
  BASELINE_POLICY,
  collectFrameOrigins,
  isFrameOrigin,
  normalizeFrameOrigins,
  serializeContentSecurityPolicy,
} from "./index.ts";

describe("the baseline policy", () => {
  it("is the exact string R-47 fixes", () => {
    expect(BASELINE_POLICY).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'"
    );
  });
});

describe("isFrameOrigin", () => {
  it("accepts an HTTPS origin", () => {
    expect(isFrameOrigin("https://viewer.example.com")).toBe(true);
  });

  it("accepts an HTTPS origin with a port", () => {
    expect(isFrameOrigin("https://viewer.example.com:8443")).toBe(true);
  });

  it.each([
    ["a path", "https://viewer.example.com/embed"],
    ["plain HTTP", "http://viewer.example.com"],
    ["a wildcard host", "https://*.example.com"],
    ["the broad scheme source", "https:"],
    ["a wildcard", "*"],
    ["a policy keyword", "'self'"],
    ["a header fragment", "frame-src https://viewer.example.com"],
    ["a directive separator", "https://a.example.com; script-src *"],
    ["a trailing slash", "https://viewer.example.com/"],
    ["an empty string", ""],
  ])("refuses %s", (_label, value) => {
    expect(isFrameOrigin(value)).toBe(false);
  });
});

describe("normalizeFrameOrigins", () => {
  it("drops an invalid origin instead of failing the whole list", () => {
    expect(normalizeFrameOrigins(["https://a.example.com", "*"])).toEqual([
      "https://a.example.com",
    ]);
  });

  it("removes a duplicate and keeps the supplied order", () => {
    expect(
      normalizeFrameOrigins([
        "https://b.example.com",
        "https://a.example.com",
        "https://b.example.com",
      ])
    ).toEqual(["https://b.example.com", "https://a.example.com"]);
  });
});

describe("serializeContentSecurityPolicy", () => {
  it("returns the baseline when no origin survives", () => {
    expect(serializeContentSecurityPolicy([])).toBe(BASELINE_POLICY);
  });

  it("replaces frame-src and leaves the other three directives alone", () => {
    const policy = serializeContentSecurityPolicy([
      "https://viewer.example.com",
    ]);

    expect(policy).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://viewer.example.com"
    );
  });

  it("never emits a second policy or an extra directive", () => {
    const policy = serializeContentSecurityPolicy([
      "https://viewer.example.com",
    ]);

    expect(policy.split(";")).toHaveLength(4);
    expect(policy).not.toContain("default-src");
    expect(policy).not.toContain("script-src");
    expect(policy).not.toContain("style-src");
    expect(policy).not.toContain("nonce");
  });
});

describe("collectFrameOrigins", () => {
  const ctx = { tenant: { id: "one" } };

  it("contributes nothing when the provider is omitted", async () => {
    await expect(collectFrameOrigins(undefined, ctx)).resolves.toEqual([]);
  });

  it("contributes nothing when the provider returns an empty list", async () => {
    await expect(
      collectFrameOrigins({ frameOrigins: () => Promise.resolve([]) }, ctx)
    ).resolves.toEqual([]);
  });

  it("contributes nothing when the provider throws", async () => {
    await expect(
      collectFrameOrigins(
        {
          frameOrigins: () => {
            throw new Error("backing record read failed");
          },
        },
        ctx
      )
    ).resolves.toEqual([]);
  });

  it("contributes nothing when the provider rejects", async () => {
    await expect(
      collectFrameOrigins(
        { frameOrigins: () => Promise.reject(new Error("down")) },
        ctx
      )
    ).resolves.toEqual([]);
  });

  // These assert the collector's own return value. Routing them through
  // serializeContentSecurityPolicy would normalize a second time and hide
  // whether the collector filtered anything at all.
  it("drops an invalid contribution rather than widening the policy", async () => {
    await expect(
      collectFrameOrigins(
        {
          frameOrigins: () =>
            Promise.resolve(["https:", "*", "https://ok.example.com"]),
        },
        ctx
      )
    ).resolves.toEqual(["https://ok.example.com"]);
  });

  it("drops a contribution that is not HTTPS", async () => {
    await expect(
      collectFrameOrigins(
        {
          frameOrigins: () =>
            Promise.resolve([
              "http://plain.example.com",
              "https://ok.example.com",
            ]),
        },
        ctx
      )
    ).resolves.toEqual(["https://ok.example.com"]);
  });

  it("removes a repeated contribution and keeps the supplied order", async () => {
    await expect(
      collectFrameOrigins(
        {
          frameOrigins: () =>
            Promise.resolve([
              "https://b.example.com",
              "https://a.example.com",
              "https://b.example.com",
            ]),
        },
        ctx
      )
    ).resolves.toEqual(["https://b.example.com", "https://a.example.com"]);
  });

  it("gives each context only its own origins", async () => {
    const provider = {
      frameOrigins: (given: { tenant: { id: string } }) =>
        Promise.resolve([`https://${given.tenant.id}.example.com`]),
    };

    await expect(
      collectFrameOrigins(provider, { tenant: { id: "one" } })
    ).resolves.toEqual(["https://one.example.com"]);
    await expect(
      collectFrameOrigins(provider, { tenant: { id: "two" } })
    ).resolves.toEqual(["https://two.example.com"]);
  });

  it("contributes nothing when every contribution is invalid", async () => {
    await expect(
      collectFrameOrigins(
        { frameOrigins: () => Promise.resolve(["*", "https:"]) },
        ctx
      )
    ).resolves.toEqual([]);
  });
});
