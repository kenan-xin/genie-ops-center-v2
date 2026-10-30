import {
  AppError,
  CORE_ERROR_MESSAGES,
  CORE_ERRORS,
  createRequestPrincipal,
  defineModuleErrors,
  implementModule,
  ModuleManagementError,
  type TenantContext,
} from "@genie/core";
import { oc } from "@genie/core/rpc";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { isUnauthenticatedAnswer } from "../unauthenticated.ts";
import {
  createRpcHandler,
  RPC_PREFIX,
  type RequestContext,
} from "./handler.ts";

const REQUEST_ID = "req-handler-test";

const HANDLER_TEST_ERRORS = defineModuleErrors("reports", {
  "quota-exceeded": { message: "The reports quota is used up.", status: 409 },
});

const contract = {
  echo: oc
    .route({ method: "POST", path: "/reports/echo" })
    .input(z.object({ name: z.string() })),
  forbidden: oc.route({ method: "POST", path: "/reports/forbidden" }),
  limited: oc.route({ method: "POST", path: "/reports/limited" }),
  quota: oc.route({ method: "POST", path: "/reports/quota" }),
  leaky: oc.route({ method: "POST", path: "/reports/leaky" }),
  notCompiled: oc.route({ method: "POST", path: "/reports/not-compiled" }),
  notRegistered: oc.route({ method: "POST", path: "/reports/not-registered" }),
  configInvalid: oc.route({ method: "POST", path: "/reports/config-invalid" }),
};

const ENDPOINT_ISSUE = { path: "endpoint", message: "Invalid url" };

const os = implementModule("reports", contract);

const router = os.router({
  echo: os.echo.handler(({ input }) => ({ greeting: `hello ${input.name}` })),
  forbidden: os.forbidden.handler(() => {
    throw new AppError(CORE_ERRORS.forbidden);
  }),
  limited: os.limited.handler(() => {
    throw new AppError(CORE_ERRORS["rate-limited"], { retryAfterMinutes: 3 });
  }),
  quota: os.quota.handler(() => {
    throw new AppError(HANDLER_TEST_ERRORS["quota-exceeded"]);
  }),
  leaky: os.leaky.handler(() => {
    throw new Error(
      'duplicate key value violates unique constraint "secret_pkey"'
    );
  }),
  notCompiled: os.notCompiled.handler(() => {
    throw new ModuleManagementError(
      "module-not-compiled",
      "module-not-compiled: secret-module is not compiled into this image"
    );
  }),
  notRegistered: os.notRegistered.handler(() => {
    throw new ModuleManagementError(
      "module-not-registered",
      "module-not-registered: secret-module has no tenant_module row"
    );
  }),
  configInvalid: os.configInvalid.handler(() => {
    throw new ModuleManagementError(
      "module-config-invalid",
      "module-config-invalid: secret-module endpoint: Invalid url",
      [ENDPOINT_ISSUE]
    );
  }),
});

type Logged = { readonly cause: unknown; readonly requestId: string };

function setup(options: { readonly anonymous?: boolean } = {}) {
  const logged: Logged[] = [];
  const entitlementReads: string[] = [];

  const handler = createRpcHandler({ reports: router }, (cause, meta) => {
    logged.push({ cause, requestId: meta.requestId });
  });

  // SAFETY: these procedures read only the entitlement reader, so the tenant is a stub holding it.
  const tenant = {
    entitlements: {
      isEnabled: (moduleId: string) => {
        entitlementReads.push(moduleId);

        return Promise.resolve(true);
      },
    },
  } as TenantContext;

  const context = (): RequestContext => ({
    tenant,
    requestId: REQUEST_ID,
    caller: createRequestPrincipal(
      {
        userId: options.anonymous === true ? "anonymous" : "test-user",
        groups: [],
        authenticated: options.anonymous !== true,
      },
      () => Promise.resolve({ keys: new Set(), scopes: new Map() })
    ),
  });

  const call = async (procedure: string, body?: string): Promise<Response> => {
    const result = await handler.handle(
      new Request(`http://genie.test${RPC_PREFIX}/reports/${procedure}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ?? null,
      }),
      { prefix: RPC_PREFIX, context: context() }
    );

    if (!result.matched) throw new Error(`no procedure matched ${procedure}`);

    return result.response;
  };

  return { call, logged, entitlementReads };
}

type ErrorBody = {
  readonly json: {
    readonly defined: boolean;
    readonly code: string;
    readonly status: number;
    readonly message: string;
    readonly data: {
      readonly appCode: string;
      readonly requestId: string;
      readonly retryAfterMinutes?: number;
      readonly issues?: readonly { path: string; message: string }[];
    };
  };
};

async function refusal(response: Response) {
  const text = await response.text();

  // SAFETY: every call below reads a refusal the handler wrote, and the assertions check each
  // field this type names.
  return { status: response.status, text, body: JSON.parse(text) as ErrorBody };
}

describe("the RPC handler's error interceptor", () => {
  it("answers a procedure call through the handler", async () => {
    const { call } = setup();

    const response = await call(
      "echo",
      JSON.stringify({ json: { name: "ada" } })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: { greeting: "hello ada" } });
  });

  it("writes a refusal as { json: { defined, code, status, message, data } }, which the raw reader reads", async () => {
    const { call } = setup({ anonymous: true });

    const response = await call("forbidden");

    expect(await isUnauthenticatedAnswer(response)).toBe(true);

    const answer = await refusal(response);

    expect(answer.status).toBe(401);
    expect(answer.body).toEqual({
      json: {
        defined: false,
        code: "unauthenticated",
        status: 401,
        message: CORE_ERROR_MESSAGES.unauthenticated,
        data: { appCode: "unauthenticated", requestId: REQUEST_ID },
      },
    });
  });

  it("answers an AppError forbidden at 403 with its catalogue code and message", async () => {
    const { call } = setup();

    const answer = await refusal(await call("forbidden"));

    expect(answer.status).toBe(403);
    expect(answer.body.json.data).toEqual({
      appCode: "forbidden",
      requestId: REQUEST_ID,
    });
    expect(answer.body.json.message).toBe(CORE_ERROR_MESSAGES.forbidden);
  });

  it("sets the HTTP status from ORPCError's status option: 429 with the wait for rate-limited", async () => {
    const { call } = setup();

    const answer = await refusal(await call("limited"));

    // oRPC has no default status for this code and would answer 500 without the option.
    expect(answer.status).toBe(429);
    expect(answer.body.json.status).toBe(429);
    expect(answer.body.json.data).toEqual({
      appCode: "rate-limited",
      requestId: REQUEST_ID,
      retryAfterMinutes: 3,
    });
  });

  it("answers a module AppError with its own code, safe message and declared status", async () => {
    const { call } = setup();

    const answer = await refusal(await call("quota"));

    expect(answer.status).toBe(409);
    expect(answer.body.json.data.appCode).toBe("reports:quota-exceeded");
    expect(answer.body.json.message).toBe("The reports quota is used up.");
  });

  it.each([
    ["notCompiled", "module-not-compiled", 404, undefined],
    ["notRegistered", "module-not-registered", 409, undefined],
    ["configInvalid", "module-config-invalid", 400, [ENDPOINT_ISSUE]],
  ] as const)(
    "answers the module-management refusal %s with its catalogue code, status and issues, never the operator text",
    async (procedure, appCode, status, issues) => {
      const { call } = setup();

      const answer = await refusal(await call(procedure));

      expect(answer.status).toBe(status);
      expect(answer.body.json.data).toEqual(
        issues === undefined
          ? { appCode, requestId: REQUEST_ID }
          : { appCode, requestId: REQUEST_ID, issues }
      );
      expect(answer.body.json.message).toBe(CORE_ERROR_MESSAGES[appCode]);
      expect(answer.text).not.toContain("secret-module");
    }
  );

  it("answers a plain Error inside a procedure with the generic 500 and no cause text", async () => {
    const { call } = setup();

    const answer = await refusal(await call("leaky"));

    expect(answer.status).toBe(500);
    expect(answer.body.json.data).toEqual({
      appCode: "internal-error",
      requestId: REQUEST_ID,
    });
    expect(answer.body.json.message).toBe(
      CORE_ERROR_MESSAGES["internal-error"]
    );
    expect(answer.text).not.toContain("secret_pkey");
    expect(answer.text).not.toContain("unique constraint");
    expect(answer.text).not.toMatch(/at \S+:\d+/);
  });

  it("answers a zod input failure with invalid-input at 400 and no zod issues", async () => {
    const { call } = setup();

    const answer = await refusal(
      await call("echo", JSON.stringify({ json: { name: 7 } }))
    );

    expect(answer.status).toBe(400);
    expect(answer.body.json.data).toEqual({
      appCode: "invalid-input",
      requestId: REQUEST_ID,
    });
    expect(answer.body.json.message).toBe(CORE_ERROR_MESSAGES["invalid-input"]);
    expect(answer.text).not.toContain("issues");
  });

  // oRPC 1.15.5 turns a decode failure into BAD_REQUEST only outside the interceptor chain, so
  // these two prove the marker mapping, and fail if an upgrade changes either side of it.
  it("answers an invalid JSON body with invalid-input at 400", async () => {
    const { call } = setup();

    const answer = await refusal(await call("echo", "{not json"));

    expect(answer.status).toBe(400);
    expect(answer.body.json.data).toEqual({
      appCode: "invalid-input",
      requestId: REQUEST_ID,
    });
  });

  it("answers a body of null with invalid-input at 400", async () => {
    const { call } = setup();

    const answer = await refusal(await call("echo", "null"));

    expect(answer.status).toBe(400);
    expect(answer.body.json.data).toEqual({
      appCode: "invalid-input",
      requestId: REQUEST_ID,
    });
  });

  it("logs the raw error with the request id before mapping it", async () => {
    const { call, logged } = setup();

    await call("leaky");

    expect(logged).toHaveLength(1);
    expect(logged[0]?.requestId).toBe(REQUEST_ID);
    expect(String(logged[0]?.cause)).toContain("secret_pkey");
  });

  it("runs the entitlement gate once per call, with middleware dedupe at its default", async () => {
    const { call, entitlementReads } = setup();

    await call("echo", JSON.stringify({ json: { name: "ada" } }));

    expect(entitlementReads).toEqual(["reports"]);
  });
});
