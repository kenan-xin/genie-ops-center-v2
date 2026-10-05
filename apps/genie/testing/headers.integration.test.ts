import { request } from "node:http";

import {
  enableModules,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { imageHostPort } from "./image-ports.ts";
import { startBuiltApp } from "./start-built-app.ts";

/** The PUBLIC_URL `startBuiltApp` gives the server. */
const PUBLIC_URL = "https://example.invalid";

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
  // Test stand-in for `genie-ops setup`, which populates these rows in 1ia.4.
  await markSetupDone(deployment.context);

  // Stand-in for the `seed` step (R-20), which genie-ops setup brings in 1ia.2. Without the row,
  // R-8 reads the placeholder as disabled and refuses `placeholder.read`.
  await enableModules(deployment.context, ["placeholder"]);

  server = await startBuiltApp(
    deployment.context.env.databaseUrl,
    imageHostPort(3411)
  );
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
    requestId: response.headers.get("x-request-id") ?? "",
    body: await response.text(),
  };
}

/** The request lines the proxy wrote for one path (R-44, one line per request). */
const requestLinesFor = (logs: string, path: string) =>
  logs
    .split("\n")
    .filter(
      (line) =>
        line.includes('"msg":"request"') && line.includes(`"path":"${path}"`)
    ).length;

/** The request lines the proxy wrote for one request id. */
const requestLinesWithId = (logs: string, requestId: string) =>
  logs
    .split("\n")
    .filter(
      (line) =>
        line.includes('"msg":"request"') &&
        line.includes(`"requestId":"${requestId}"`)
    ).length;

/** The provider invocation lines the counted wrapper wrote so far. */
const providerCountIn = (logs: string) =>
  logs
    .split("\n")
    .filter((line) => line.includes("frame origin provider invoked")).length;

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
    // Spec 2 R-71: the sign-in page in a refusal state and the break-glass door.
    "/sign-in?error=signed_out",
    "/admin/login",
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

    expect(plain.status).toBe(200);
    expect(slashed.status).toBe(200);
    expect(slashed.headers.get("content-security-policy")).toBe(
      plain.headers.get("content-security-policy")
    );

    // Both spellings carry the full header set, not only the policy.
    for (const response of [plain, slashed]) {
      for (const header of FIVE) {
        expect(response.headers.get(header)).not.toBeNull();
      }
    }
  });

  it("a non-route path under the viewer prefix keeps the deny baseline", async () => {
    const response = await raw("/viewer/placeholder/extra");

    expect(response.headers.get("content-security-policy")).toBe(BASELINE);
  });

  it("the application redirect carries the full header set, one policy, and a same-origin destination", async () => {
    const response = await raw("/home");

    expect(response.status).toBe(307);

    for (const header of FIVE) {
      expect(response.headers.get(header)).not.toBeNull();
    }

    // Exactly one policy: the baseline, repeated for the redirect the proxy
    // created itself.
    expect(response.headers.get("content-security-policy")).toBe(BASELINE);

    // The destination is the deployment's own origin, PUBLIC_URL, plus the
    // mapped path, asserted exactly (R-70). Behind the proxy the request host is
    // the PUBLIC_URL host and Next relativizes the location to "/"; this server
    // is reached on 127.0.0.1, so it stays absolute. Either spelling resolves
    // to PUBLIC_URL's root, and another origin or path fails here.
    const location = response.headers.get("location");

    expect(new URL(location ?? "", PUBLIC_URL).toString()).toBe(
      new URL("/", PUBLIC_URL).toString()
    );
  });

  it("the application redirect ignores a foreign Host header (R-70)", async () => {
    const { port } = new URL(server.baseUrl);

    const location = await new Promise<string | undefined>(
      (resolve, reject) => {
        request(
          {
            host: "127.0.0.1",
            port,
            path: "/home",
            headers: {
              "host": "attacker.example.invalid",
              "x-forwarded-host": "attacker.example.invalid",
            },
          },
          (response) => {
            response.resume();
            resolve(response.headers.location);
          }
        )
          .on("error", reject)
          .end();
      }
    );

    expect(location).toBe(new URL("/", PUBLIC_URL).toString());
  });

  // R-44 says one line per request, and a redirect is a request. The proxy used
  // to emit the redirect before it reached the log call, so `/home` produced
  // zero lines and the requirement was false for exactly this path. This asserts
  // the fix: exactly one line for this request, not zero and not two.
  //
  // The line is counted by this response's own request id, not by a path delta.
  // The log reaches the test through a stdout pipe that is independent of the
  // HTTP socket, so the previous test's `/home` line can arrive after a
  // `before` count was taken, and a delta then reads two (develop CI, 1rd.12.3).
  it("the application redirect writes exactly one request line", async () => {
    const response = await raw("/home");

    expect(response.status).toBe(307);
    expect(response.requestId).toMatch(/^[0-9a-f-]{36}$/);

    await expect
      .poll(() => requestLinesWithId(server.logs(), response.requestId), {
        timeout: 5000,
      })
      .toBe(1);

    // Not two either. One process writes both lines to one stdout in order, so
    // once a later request's line is visible, a duplicate of the earlier line
    // would be visible too.
    const barrier = await raw("/api/status");

    await expect
      .poll(() => requestLinesWithId(server.logs(), barrier.requestId), {
        timeout: 5000,
      })
      .toBe(1);
    expect(requestLinesWithId(server.logs(), response.requestId)).toBe(1);

    // The line is the redirect's own: it names the redirected path.
    const line = server
      .logs()
      .split("\n")
      .find((candidate) => candidate.includes(response.requestId));

    expect(line).toContain('"path":"/home"');
  });

  // Amendment B: the narrow exception, asserted rather than ignored. The 308
  // itself stays bare — a relative same-origin Location and the destination as
  // its body, none of the five headers, no application request line, and no
  // provider invocation — while the destination it hands off to is fully
  // covered, which is what bounds the exception.
  for (const [path, destination] of [
    ["//viewer", "/viewer"],
    ["/viewer//x", "/viewer/x"],
    ["/\\viewer", "/viewer"],
    ["/\\\\viewer", "/viewer"],
  ] as const) {
    it(`${path} is the normalization exception`, async () => {
      const beforeProviders = providerCountIn(server.logs());
      const beforeRequests = requestLinesFor(server.logs(), path);

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

      // No application code ran for the normalization request: the proxy wrote
      // no request line for it and invoked no provider for it. Polled, because
      // the log read races the logger's own flush on a fast response.
      await expect
        .poll(() => requestLinesFor(server.logs(), path), { timeout: 5000 })
        .toBe(beforeRequests);
      await expect
        .poll(() => providerCountIn(server.logs()), { timeout: 5000 })
        .toBe(beforeProviders);

      // The destination itself is fully covered, which is what bounds the
      // exception: all five headers, and exactly one policy — the deny
      // baseline these non-route destinations carry.
      const followed = await raw(destination);

      for (const header of FIVE) {
        expect(followed.headers.get(header)).not.toBeNull();
      }

      expect(followed.headers.get("content-security-policy")).toBe(BASELINE);
    });
  }

  // Headers alone do not prove the transport worked. Without these two, a
  // `placeholder.read` that returned an ordinary framework 404, or an unknown
  // procedure that never reached the adapter, would still pass the header loop.
  // The request is anonymous, so the envelope answers `unauthenticated` at 401
  // (Spec 2 R-14); the tRPC envelope is the proof the adapter was reached.
  it("the tRPC procedure path answers its refusal envelope, not a framework 404", async () => {
    const response = await raw("/api/trpc/placeholder.read?input=%7B%7D");

    expect(response.status).toBe(401);

    // SAFETY: the body is the tRPC envelope this route wrote, and the assertions
    // below check the fields this test reads.
    const body = JSON.parse(response.body) as {
      error?: { data?: { code?: string; appCode?: string } };
    };

    expect(body.error?.data?.code).toBe("UNAUTHORIZED");
    expect(body.error?.data?.appCode).toBe("unauthenticated");
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
