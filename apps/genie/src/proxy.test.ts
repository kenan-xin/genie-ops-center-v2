import { BASELINE_POLICY } from "@genie/core";
import { NextRequest } from "next/server.js";
import { describe, expect, it, vi } from "vitest";

import { buildViewerPolicy, proxy } from "./proxy.ts";

describe("buildViewerPolicy", () => {
  it("replaces the frame source with the owning provider's origin", async () => {
    const policy = await buildViewerPolicy({
      provider: {
        frameOrigins: async () => ["https://embed.placeholder.example.com"],
      },
      ctx: { tenant: {} },
      report: vi.fn(),
    });

    expect(policy).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com"
    );
  });

  it("denies frames and reports when the provider fails", async () => {
    const report = vi.fn();

    const policy = await buildViewerPolicy({
      provider: {
        frameOrigins: () => Promise.reject(new Error("upstream down")),
      },
      ctx: { tenant: {} },
      report,
    });

    expect(policy).toBe(BASELINE_POLICY);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("denies frames for an invalid contribution", async () => {
    const policy = await buildViewerPolicy({
      provider: {
        frameOrigins: async () => ["*", "https:", "http://insecure.example"],
      },
      ctx: { tenant: {} },
      report: vi.fn(),
    });

    expect(policy).toBe(BASELINE_POLICY);
  });

  it("denies frames when no provider is registered for the route", async () => {
    const policy = await buildViewerPolicy({
      provider: undefined,
      ctx: { tenant: {} },
      report: vi.fn(),
    });

    expect(policy).toBe(BASELINE_POLICY);
  });
});

describe("the application redirect", () => {
  it("carries all five headers and exactly one policy", async () => {
    const response = await proxy(
      new NextRequest("https://example.invalid/home")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/");

    for (const header of [
      "content-security-policy",
      "strict-transport-security",
      "referrer-policy",
      "x-content-type-options",
      "permissions-policy",
    ]) {
      expect(response.headers.get(header)).not.toBeNull();
    }

    expect(response.headers.get("content-security-policy")).toBe(
      BASELINE_POLICY
    );
  });
});
