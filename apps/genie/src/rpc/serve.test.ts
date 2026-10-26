import {
  CORE_ERROR_MESSAGES,
  CorrelationScope,
  createRequestPrincipal,
  implementModule,
  type TenantContext,
} from "@genie/core";
import { oc } from "@genie/core/rpc";
import { describe, expect, it } from "vitest";

import { type AppContext, CONTEXT_HEADER } from "../context.ts";
import { createRpcHandler } from "./handler.ts";
import { serveRpc } from "./serve.ts";

const PUBLIC_URL = "https://genie.test";

const contract = { read: oc.route({ method: "POST", path: "/reports/read" }) };

const os = implementModule("reports", contract);

function setup(options: { readonly principalFails?: boolean } = {}) {
  const logged: string[] = [];

  const scopes: string[] = [];
  const reads: string[] = [];

  const router = os.router({
    read: os.read.handler(({ context }) => {
      reads.push(context.requestId ?? "none");
      scopes.push(context.tenant.correlationScope.current() ?? "none");

      return "read";
    }),
  });

  // SAFETY: the route reads only the public URL of the deployment environment.
  const env = { publicUrl: PUBLIC_URL } as TenantContext["env"];

  // SAFETY: the route reads only these members of the context and the tenant.
  const tenant = {
    env,
    entitlements: {
      isEnabled: (moduleId: string) => Promise.resolve(moduleId === "reports"),
    },
    correlationScope: new CorrelationScope(),
  } as TenantContext;

  // SAFETY: as above, the route reads only the tenant and the context id.
  const app = {
    tenant,
    contextId: "context-1",
    logError: (cause: unknown, meta: { readonly requestId: string }) => {
      expect(String(cause)).toContain("session table unavailable");
      logged.push(meta.requestId);
    },
  } as AppContext;

  const serve = (
    path: string,
    headers: Record<string, string>,
    body: ReadableStream<Uint8Array> | null = null
  ) => {
    // Node's fetch refuses a stream body without `duplex`, which the DOM type does not declare.
    const init: RequestInit & { readonly duplex: "half" } = {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      duplex: "half",
    };

    return serveRpc({
      request: new Request(`${PUBLIC_URL}/api/rpc${path}`, init),
      app,
      handler: createRpcHandler({ reports: router }, () => undefined),
      principal: () =>
        options.principalFails === true
          ? Promise.reject(new Error("session table unavailable"))
          : Promise.resolve(
              createRequestPrincipal(
                { userId: "test-user", groups: [], authenticated: true },
                () => Promise.resolve({ keys: new Set(), scopes: new Map() })
              )
            ),
    });
  };

  return { serve, scopes, reads, logged };
}

describe("serveRpc", () => {
  it("runs a same-origin call inside the correlation scope of the proxy's request id", async () => {
    const { serve, scopes, reads } = setup();

    const response = await serve("/reports/read", {
      "sec-fetch-site": "same-origin",
      "x-request-id": "req-serve",
    });

    expect(response.status).toBe(200);
    expect(scopes).toEqual(["req-serve"]);
    expect(reads).toEqual(["req-serve"]);
    expect(response.headers.get(CONTEXT_HEADER)).toBe("context-1");
  });

  it("refuses a call with no same-origin proof before any procedure runs", async () => {
    const { serve, reads } = setup();

    const response = await serve("/reports/read", {
      origin: "https://evil.test",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "cross-origin-request" });
    expect(reads).toEqual([]);
    expect(response.headers.get(CONTEXT_HEADER)).toBe("context-1");
  });

  it("logs a failed session read with the request id and answers the generic 500", async () => {
    const { serve, reads, logged } = setup({ principalFails: true });

    const response = await serve("/reports/read", {
      "origin": PUBLIC_URL,
      "x-request-id": "req-session",
    });

    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({
      code: "internal-error",
      requestId: "req-session",
    });
    expect(text).not.toContain("session table");
    expect(logged).toEqual(["req-session"]);
    expect(reads).toEqual([]);
    expect(response.headers.get(CONTEXT_HEADER)).toBe("context-1");
  });

  it("answers an unknown procedure path with the catalogue not-found body at 404", async () => {
    const { serve } = setup();

    const response = await serve("/reports/missing", {
      "origin": PUBLIC_URL,
      "x-request-id": "req-unknown",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "not-found",
      message: CORE_ERROR_MESSAGES["not-found"],
      requestId: "req-unknown",
    });
    expect(response.headers.get(CONTEXT_HEADER)).toBe("context-1");
  });

  it.each([
    ["declares one byte over 2 MB", { "content-length": "2097153" }],
    // A media type ignores case, and oRPC parses only the lower-case spelling as multipart, so
    // this one would reach it as a binary body and be read whole.
    [
      "is multipart and declares no length",
      { "content-type": "Multipart/Form-Data; boundary=b" },
    ],
  ])(
    "refuses a body that %s at 413 without reading it (DR-23)",
    async (_case, headers) => {
      const { serve, reads } = setup();
      let pulled = false;

      // A high-water mark of 0: the stream is pulled only when a reader asks for its bytes.
      const body = new ReadableStream<Uint8Array>(
        {
          pull: (controller) => {
            pulled = true;
            controller.close();
          },
        },
        { highWaterMark: 0 }
      );

      const response = await serve(
        "/reports/read",
        {
          "sec-fetch-site": "same-origin",
          "x-request-id": "req-large",
          ...headers,
        },
        body
      );

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({
        code: "request-too-large",
        message: CORE_ERROR_MESSAGES["request-too-large"],
        requestId: "req-large",
      });
      expect(pulled).toBe(false);
      expect(reads).toEqual([]);
      expect(response.headers.get(CONTEXT_HEADER)).toBe("context-1");
    }
  );

  it("reads a body declared at exactly 2 MB (DR-23)", async () => {
    const { serve, reads } = setup();

    const response = await serve("/reports/read", {
      "sec-fetch-site": "same-origin",
      "x-request-id": "req-edge",
      "content-length": "2097152",
    });

    expect(response.status).toBe(200);
    expect(reads).toEqual(["req-edge"]);
  });
});
