import { describe, expect, it } from "vitest";

import { createTenantContext } from "../src/lib/tenant-context/index.ts";
import { createRequestPrincipal } from "../src/services/authorization/index.ts";

/** The one key the link below is created under; the file store only records it. */
const GRANTED_KEY = "placeholder:read";

import { FILE_DOWNLOAD_PATH } from "../src/services/file-storage/index.ts";
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
  // The builder takes no request, so no request Host or forwarded header can reach the link.
  expect(publicUrl(contextWithPublicUrl(), path, query)).toBe(expected);
}

describe("PUBLIC_URL link construction (Spec 1 AC-14)", () => {
  it.each([
    {
      link: "identity callback URL",
      path: "/api/auth/callback/keycloak",
      query: { returnTo: "/" },
      expected: `${PUBLIC_URL}/api/auth/callback/keycloak?returnTo=%2F`,
    },
    {
      link: "email invitation link",
      path: "/invite",
      query: { token: "invite-token" },
      expected: `${PUBLIC_URL}/invite?token=invite-token`,
    },
  ])(
    "builds the $link from PUBLIC_URL regardless of request Host",
    ({ path, query, expected }) => {
      assertHostIndependentLink(path, query, expected);
    }
  );

  it("builds the tokenized download link from PUBLIC_URL regardless of request Host", async () => {
    assertHostIndependentLink(
      "/api/files/download",
      { token: "download-token" },
      `${PUBLIC_URL}/api/files/download?token=download-token`
    );

    // The file store's own link goes through the same builder.
    const context = contextWithPublicUrl();

    try {
      const link = await context.fileStorage.createLink({
        fileId: "file-1",
        principal: createRequestPrincipal(
          { userId: "u1", groups: [], authenticated: true },
          () =>
            Promise.resolve({
              keys: new Set([GRANTED_KEY] as const),
              scopes: new Map([[GRANTED_KEY, { kind: "all" } as const]]),
            })
        ),
        permission: GRANTED_KEY,
        resource: { type: "document", id: "document-1" },
      });

      expect(link.url).toBe(
        `${PUBLIC_URL}${FILE_DOWNLOAD_PATH}?${new URLSearchParams({ token: link.token }).toString()}`
      );
    } finally {
      await context.db.$client.end();
    }
  });
});
