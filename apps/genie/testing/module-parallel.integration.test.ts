import {
  createRequestPrincipal,
  implementModule,
  type TenantContext,
} from "@genie/core";
import { oc } from "@genie/core/rpc";
import { describe, expect, it } from "vitest";

import {
  createRpcHandler,
  RPC_PREFIX,
  type RequestContext,
} from "../src/rpc/handler.ts";
import { composeRouter } from "../src/rpc/router.ts";
import {
  createServerRpcClient,
  rpcFailureOf,
} from "../src/rpc/server-client.ts";

const REQUEST_ID = "req-module-parallel-test";

// SAFETY: these procedures read only this reader, and it returns the test module states.
const tenant = {
  entitlements: {
    isEnabled: (moduleId: string) => Promise.resolve(moduleId === "enabled"),
  },
} as TenantContext;

const enabledContract = {
  value: oc.route({ method: "POST", path: "/enabled/value" }),
};

const disabledContract = {
  value: oc.route({ method: "POST", path: "/disabled/value" }),
};

const enabled = implementModule("enabled", enabledContract);

const disabled = implementModule("disabled", disabledContract);

const handler = createRpcHandler(
  composeRouter([
    [
      "enabled",
      enabled.router({ value: enabled.value.handler(() => "enabled data") }),
    ],
    [
      "disabled",
      disabled.router({
        value: disabled.value.handler(() => "must not resolve"),
      }),
    ],
  ]),
  () => undefined
);

/** Each call is its own request, with its own context, as two browser calls are. */
async function answer(request: Request): Promise<Response> {
  const context: RequestContext = {
    tenant,
    requestId: REQUEST_ID,
    caller: createRequestPrincipal(
      { userId: "test-user", groups: [], authenticated: true },
      () => Promise.resolve({ keys: new Set(), scopes: new Map() })
    ),
  };

  const result = await handler.handle(request, { prefix: RPC_PREFIX, context });

  if (!result.matched) throw new Error(`no procedure matched ${request.url}`);

  return result.response;
}

const client = createServerRpcClient<{
  enabled: typeof enabledContract;
  disabled: typeof disabledContract;
}>({ url: `http://genie.test${RPC_PREFIX}`, fetch: answer });

describe("module procedures in two parallel calls", () => {
  it("answers the enabled module call while refusing only the disabled module call", async () => {
    const [enabledAnswer, disabledAnswer] = await Promise.allSettled([
      client.enabled.value(),
      client.disabled.value(),
    ]);

    expect(enabledAnswer).toEqual({
      status: "fulfilled",
      value: "enabled data",
    });
    expect(disabledAnswer.status).toBe("rejected");

    if (disabledAnswer.status !== "rejected") {
      throw new Error("the disabled module call unexpectedly resolved");
    }

    expect(rpcFailureOf(disabledAnswer.reason)).toMatchObject({
      status: 403,
      data: { appCode: "module-disabled", requestId: REQUEST_ID },
    });
  });
});
