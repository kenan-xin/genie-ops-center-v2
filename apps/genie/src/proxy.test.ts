import { BASELINE_POLICY } from "@genie/core";
import { NextRequest } from "next/server.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type AppContext, publishContext } from "./context.ts";
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

// SAFETY: the proxy reads only the members below and the entitlement reader
// the gate calls; the rest of the tenant is the opaque value it hands the
// provider, so the partial object is never otherwise dereferenced. The reader
// answers enabled, so these viewer cases exercise the provider path.
function viewerAppWith(provider: {
  frameOrigins: () => Promise<string[]>;
}): AppContext {
  // SAFETY: the proxy reads only the members below and the entitlement reader
  // the gate calls; the rest of the tenant is the opaque value it hands the
  // provider, so the partial object is never otherwise dereferenced.
  return {
    tenant: {
      entitlements: {
        isEnabled: async (_moduleId: string): Promise<boolean> => true,
      },
    } as AppContext["tenant"],
    startedAt: 0,
    contextId: "ctx-proxy-test",
    moduleRoutes: new Map(),
    // The gate is satisfied, so these viewer cases exercise the provider path rather than the
    // not-set-up page; the gate's own behaviour is covered by the integration suite.
    setupGate: { isSatisfied: async () => true },
    viewerProviders: new Map([["placeholder", provider]]),
    reportProviderFailure: vi.fn(),
    logRequest: vi.fn(),
    logError: vi.fn(),
  };
}

describe("background requests at the viewer url", () => {
  // The seam stores its slot under this process-global key by its own
  // documented mechanism, so each test publishes one context and the hooks drop
  // it again: `publishContext` refuses a second publish, and a left-over slot
  // would leak into every later test in this file.
  const CONTEXT_SLOT = Symbol.for("genie.app.context");

  function forgetContext(): void {
    Reflect.deleteProperty(globalThis, CONTEXT_SLOT);
  }

  beforeEach(forgetContext);
  afterEach(forgetContext);

  // R-49a counts zero provider invocations on background navigation requests,
  // whatever the pathname. Each form below is one a real Next client sends: the
  // router flight request (`rsc`), a full prefetch (`next-router-prefetch`) and
  // the legacy prefetch hint (`purpose`). The response must also keep the deny
  // baseline: at unit level that means the viewer policy must not replace it,
  // because the built app attaches the baseline through its header
  // configuration rather than through the proxy, so an absent header is the
  // untouched baseline here.
  it.each([
    ["rsc", "1"],
    ["next-router-prefetch", "1"],
    ["purpose", "prefetch"],
  ])(
    "does not invoke the provider or expand the policy for %s: %s",
    async (name, value) => {
      const provider = {
        frameOrigins: vi.fn(async () => [
          "https://embed.placeholder.example.com",
        ]),
      };

      publishContext(viewerAppWith(provider));

      const response = await proxy(
        new NextRequest("https://example.invalid/viewer/placeholder", {
          headers: { [name]: value },
        })
      );

      expect(provider.frameOrigins).not.toHaveBeenCalled();
      expect(
        response.headers.get("content-security-policy") ?? BASELINE_POLICY
      ).toBe(BASELINE_POLICY);
    }
  );

  // The positive control: an ordinary document at the viewer url is the one
  // request class that may reach the provider, exactly once, and it is the one
  // response whose policy carries the frame origin. It keeps the classification
  // above honest — a fix that denied every request would pass the negative
  // cases and fail only here.
  it("invokes the provider exactly once for an ordinary viewer document", async () => {
    const provider = {
      frameOrigins: vi.fn(async () => [
        "https://embed.placeholder.example.com",
      ]),
    };

    publishContext(viewerAppWith(provider));

    const response = await proxy(
      new NextRequest("https://example.invalid/viewer/placeholder")
    );

    expect(provider.frameOrigins).toHaveBeenCalledTimes(1);
    expect(response.headers.get("content-security-policy")).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com"
    );
  });
});
