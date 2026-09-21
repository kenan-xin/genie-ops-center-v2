import { startDisposableDeployment } from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startBuiltApp } from "./start-built-app.ts";

const FIVE = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "permissions-policy",
];

const BASELINE =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'";

let deployment: Awaited<ReturnType<typeof startDisposableDeployment>>;

let server: Awaited<ReturnType<typeof startBuiltApp>>;

beforeAll(async () => {
  deployment = await startDisposableDeployment([placeholderModule]);
  server = await startBuiltApp(deployment.context.env.databaseUrl, 3411);
}, 240000);

afterAll(async () => {
  await server?.stop();
  await deployment?.stop();
});

/** Raw request, redirects never followed, so the redirect itself is observable. */
async function raw(path: string) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    redirect: "manual",
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.text(),
  };
}

describe("header coverage on the built application", () => {
  // AC-25 names every response class, and a tRPC error is one of them. Its
  // success form is included too, so a broken route cannot make the error case
  // pass for the wrong reason.
  for (const path of [
    "/",
    "/api/status",
    "/api/health",
    "/definitely-missing",
    "/probe.txt",
    "/api/trpc/placeholder.read?input=%7B%7D",
    "/api/trpc/does.not.exist?input=%7B%7D",
  ]) {
    it(`${path} carries all five headers and the deny baseline`, async () => {
      const response = await raw(path);

      for (const header of FIVE) {
        expect(
          response.headers.get(header),
          `${path} is missing ${header}`
        ).not.toBeNull();
      }

      expect(response.headers.get("content-security-policy")).toBe(BASELINE);
    });
  }

  it("the viewer replaces only the frame source", async () => {
    const response = await raw("/viewer/placeholder");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://embed.placeholder.example.com"
    );
  });

  it("both spellings of the viewer route carry the viewer policy", async () => {
    const plain = await raw("/viewer/placeholder");
    const slashed = await raw("/viewer/placeholder/");

    expect(slashed.status).toBe(200);
    expect(slashed.headers.get("content-security-policy")).toBe(
      plain.headers.get("content-security-policy")
    );
  });

  it("a non-route path under the viewer prefix keeps the deny baseline", async () => {
    const response = await raw("/viewer/placeholder/extra");

    expect(response.headers.get("content-security-policy")).toBe(BASELINE);
  });

  it("the application redirect carries the full header set", async () => {
    const response = await raw("/home");

    expect(response.status).toBe(307);

    for (const header of FIVE) {
      expect(response.headers.get(header)).not.toBeNull();
    }
  });

  // Amendment B: the narrow exception, asserted rather than ignored.
  for (const [path, destination] of [
    ["//viewer", "/viewer"],
    ["/viewer//x", "/viewer/x"],
    ["/\\viewer", "/viewer"],
    ["/\\\\viewer", "/viewer"],
  ] as const) {
    it(`${path} is the normalization exception`, async () => {
      const response = await raw(path);

      expect(response.status).toBe(308);

      const location = response.headers.get("location");

      expect(location).toBe(destination);
      // Same-origin and relative: it never sends a client to another origin.
      expect(location?.startsWith("/")).toBe(true);
      // Not empty: the body is the normalized destination URL.
      expect(response.body).toBe(destination);

      for (const header of FIVE) {
        expect(response.headers.get(header)).toBeNull();
      }

      // The destination itself is fully covered, which is what bounds the exception.
      const followed = await raw(destination);

      for (const header of FIVE) {
        expect(followed.headers.get(header)).not.toBeNull();
      }
    });
  }

  // Headers alone do not prove the transport worked. Without these two, a
  // `placeholder.read` that returned an ordinary framework 404, or an unknown
  // procedure that never reached the adapter, would still pass the header loop.
  it("the tRPC success path returns a result, not a framework 404", async () => {
    const response = await raw("/api/trpc/placeholder.read?input=%7B%7D");

    expect(response.status).toBe(200);

    // SAFETY: the body is the tRPC envelope this route wrote, and the
    // assertion below checks the one field this test reads.
    const body = JSON.parse(response.body) as { result?: { data?: unknown } };

    expect(body.result).toBeDefined();
  });

  it("an unknown procedure returns a tRPC error envelope with the additive fields", async () => {
    const response = await raw("/api/trpc/does.not.exist?input=%7B%7D");

    // The default transformer serializes the error directly under `error`.
    // There is no `json` wrapper unless a data transformer adds one, so an
    // earlier draft that read `error.json.data` asserted three undefined values.
    // SAFETY: the body is the tRPC envelope this route wrote, and the
    // assertions below check every field this test reads.
    const body = JSON.parse(response.body) as {
      error?: {
        data?: { code?: string; appCode?: string; requestId?: string };
      };
    };

    expect(response.status).toBe(404);
    expect(body.error).toBeDefined();
    expect(body.error?.data?.code).toBe("NOT_FOUND");
    expect(body.error?.data?.appCode).toBeDefined();
    expect(body.error?.data?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("a static chunk carries the headers", async () => {
    const home = await raw("/");
    const chunk = /\/_next\/static\/[^"']+\.js/.exec(home.body)?.[0];

    if (chunk === undefined) {
      throw new Error("no static chunk found in the document");
    }

    const response = await raw(chunk);

    for (const header of FIVE) {
      expect(response.headers.get(header)).not.toBeNull();
    }
  });
});
