import {
  createModuleTRPC,
  createRequestPrincipal,
  type TenantContext,
} from "@genie/core";
import {
  createTRPCClient,
  httpBatchLink,
  isTRPCClientError,
} from "@trpc/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, it } from "vitest";

import type { AppContext } from "../src/context.ts";
import { t, type RequestContext } from "../src/trpc/init.ts";

const REQUEST_ID = "req-module-batch-test";

// SAFETY: these procedures read only this reader, and it returns the test module states.
const tenant = {
  entitlements: {
    isEnabled: (moduleId: string) => Promise.resolve(moduleId === "enabled"),
  },
} as TenantContext;

// SAFETY: the formatter reads no application service while answering this test router.
const app = { tenant } as AppContext;

const context: RequestContext = {
  app,
  tenant,
  caller: createRequestPrincipal(
    { userId: "test-user", groups: [], authenticated: true },
    () => Promise.resolve({ keys: new Set(), scopes: new Map() })
  ),
  requestId: REQUEST_ID,
};

const enabledTRPC = createModuleTRPC("enabled");

const disabledTRPC = createModuleTRPC("disabled");

const batchRouter = t.router({
  enabled: enabledTRPC.router({
    value: enabledTRPC.procedure.query(() => "enabled data"),
  }),
  disabled: disabledTRPC.router({
    value: disabledTRPC.procedure.query(() => "must not resolve"),
  }),
});

type BatchRouter = typeof batchRouter;

const client = createTRPCClient<BatchRouter>({
  links: [
    httpBatchLink<BatchRouter>({
      url: "http://genie.test/api/trpc",
      fetch: (url, init) =>
        fetchRequestHandler({
          endpoint: "/api/trpc",
          req: new Request(url, {
            ...init,
            signal: init?.signal ?? null,
          }),
          router: batchRouter,
          createContext: () => context,
        }),
    }),
  ],
});

describe("module procedures in one tRPC batch", () => {
  it("answers an enabled module call while refusing only the disabled module call", async () => {
    const [enabled, disabled] = await Promise.allSettled([
      client.enabled.value.query(),
      client.disabled.value.query(),
    ]);

    expect(enabled).toEqual({ status: "fulfilled", value: "enabled data" });
    expect(disabled.status).toBe("rejected");

    if (disabled.status !== "rejected") {
      throw new Error("the disabled module call unexpectedly resolved");
    }

    expect(isTRPCClientError<BatchRouter>(disabled.reason)).toBe(true);
    expect(disabled.reason).toMatchObject({
      data: { appCode: "module-disabled", requestId: REQUEST_ID },
    });
  });
});
