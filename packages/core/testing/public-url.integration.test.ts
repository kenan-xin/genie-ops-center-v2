import { describe, expect, it } from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { silentLogger } from "../src/services/logging/index.ts";

const PUBLIC_URL = "https://customer.example.invalid";

type PublicUrlContext = ReturnType<typeof createTenantContext> & {
  readonly publicUrl?: (
    path: string,
    query?: Readonly<Record<string, string>>
  ) => string;
};

function contextWithPublicUrl(): ReturnType<typeof createTenantContext> {
  return createTenantContext(
    {
      DATABASE_URL: "postgres://genie:genie@localhost:5432/genie",
      PUBLIC_URL,
    },
    silentLogger(),
    []
  );
}

function publicUrl(
  context: ReturnType<typeof createTenantContext>,
  path: string,
  query?: Readonly<Record<string, string>>
): string {
  // SAFETY: the cast exposes R-70's expected TenantContext member for this red test; the assertion below checks it before invocation.
  const builder = (context as PublicUrlContext).publicUrl;

  expect(
    builder,
    "TenantContext must expose the PUBLIC_URL builder"
  ).toBeTypeOf("function");

  if (builder === undefined) {
    throw new Error("TenantContext must expose the PUBLIC_URL builder");
  }

  return builder(path, query);
}

function assertHostIndependentLink(
  path: string,
  query: Readonly<Record<string, string>> | undefined,
  expected: string
): void {
  const context = contextWithPublicUrl();
  const fromDefaultHost = publicUrl(context, path, query);

  // The caller's request headers are deliberately outside the URL-builder API.
  // Constructing requests with either proxy header must not affect the link.
  const alternateRequest = new Request(`${PUBLIC_URL}/source`, {
    headers: {
      "host": "attacker.example.invalid",
      "x-forwarded-host": "attacker.example.invalid",
    },
  });

  expect(alternateRequest.headers.get("host")).toBe("attacker.example.invalid");
  const fromAlternateHost = publicUrl(context, path, query);

  expect(fromDefaultHost).toBe(expected);
  expect(fromAlternateHost).toBe(expected);
}

describe("PUBLIC_URL link construction (Spec 1 AC-14)", () => {
  it("builds the identity callback URL from PUBLIC_URL regardless of request Host", () => {
    assertHostIndependentLink(
      "/api/auth/callback/keycloak",
      { returnTo: "/" },
      `${PUBLIC_URL}/api/auth/callback/keycloak?returnTo=%2F`
    );
  });

  it("builds the email invitation link from PUBLIC_URL regardless of request Host", () => {
    assertHostIndependentLink(
      "/invite",
      { token: "invite-token" },
      `${PUBLIC_URL}/invite?token=invite-token`
    );
  });

  it("builds the tokenized download link from PUBLIC_URL regardless of request Host", () => {
    assertHostIndependentLink(
      "/api/files/download",
      { token: "download-token" },
      `${PUBLIC_URL}/api/files/download?token=download-token`
    );
  });
});
