import {
  AppError,
  CORE_ERROR_MESSAGES,
  CORE_ERRORS,
  createRequestPrincipal,
  defineModuleErrors,
  type TenantContext,
} from "@genie/core";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, it } from "vitest";

import type { AppContext } from "../context.ts";
import { errorResponse } from "../http-errors.ts";
import { t, type RequestContext } from "./init.ts";

const REQUEST_ID = "req-envelope-test";

// SAFETY: every procedure in this file's router throws before it reads the
// context, so the stub only has to satisfy the compiler; no database opens.
const stubTenant = {} as TenantContext;

// SAFETY: the same throwing-only router never reads the application context
// either; the stub carries the tenant only to satisfy the type.
const stubApp = { tenant: stubTenant } as AppContext;

const stubContext: RequestContext = {
  app: stubApp,
  authenticated: true,
  requestId: REQUEST_ID,
  tenant: stubTenant,
  caller: createRequestPrincipal({ userId: "anonymous", groups: [] }, () =>
    Promise.resolve({ keys: new Set(), scopes: new Map() })
  ),
};

const ENVELOPE_TEST_ERRORS = defineModuleErrors("envelope-test", {
  "quota-exceeded": "The envelope test quota is used up.",
});

const errorRouter = t.router({
  notFound: t.procedure.query(() => {
    throw new AppError(CORE_ERRORS["not-found"]);
  }),
  forbidden: t.procedure.query(() => {
    throw new AppError(CORE_ERRORS.forbidden);
  }),
  moduleQuota: t.procedure.query(() => {
    throw new AppError(ENVELOPE_TEST_ERRORS["quota-exceeded"]);
  }),
  bareForbidden: t.procedure.query(() => {
    throw new TRPCError({ code: "FORBIDDEN" });
  }),
  bareBadRequest: t.procedure.query(() => {
    throw new TRPCError({ code: "BAD_REQUEST" });
  }),
  bareLeaky: t.procedure.query(() => {
    throw new TRPCError({
      code: "FORBIDDEN",
      cause: new Error("secret-upstream-detail"),
    });
  }),
  unknownError: t.procedure.query(() => {
    throw new Error(
      'duplicate key value violates unique constraint "envelope_pkey"'
    );
  }),
});

type TransportErrorBody = {
  readonly message: string;
  readonly data: {
    readonly code: string;
    readonly httpStatus: number;
    readonly appCode: string;
    readonly requestId: string;
  };
};

type TransportAnswer = {
  readonly status: number;
  readonly error: TransportErrorBody;
  readonly text: string;
};

async function transportAnswer(path: string): Promise<TransportAnswer> {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request(`http://genie.test/api/trpc/${path}`),
    router: errorRouter,
    createContext: () => stubContext,
  });

  const text = await response.text();

  // SAFETY: the body is the JSON-RPC error envelope this adapter wrote for the
  // failing procedure each call names, and the assertions below check the
  // fields this type reads.
  const parsed = JSON.parse(text) as { error?: TransportErrorBody };

  expect(parsed.error, `no error envelope for ${path}`).toBeDefined();

  // SAFETY: the assertion above checked that the adapter wrote an error
  // envelope for the procedure this call names, so `error` is defined here and
  // the fields this type reads are the ones the assertions check.
  const error = parsed.error as TransportErrorBody;

  return { status: response.status, error, text };
}

async function routeAnswer(cause: unknown): Promise<{
  status: number;
  body: { code: string; message: string };
}> {
  const response = errorResponse(cause, "route-request");
  const text = await response.text();

  // SAFETY: the body is the JSON errorResponse wrote for this cause, and the
  // assertions below check the fields this type reads.
  return { status: response.status, body: JSON.parse(text) };
}

describe("the transport error envelope", () => {
  it("answers an AppError not-found from a procedure with the route path's status and code", async () => {
    const route = await routeAnswer(new AppError(CORE_ERRORS["not-found"]));
    const transport = await transportAnswer("notFound");

    expect(route.status).toBe(404);
    expect(transport.status).toBe(route.status);
    expect(transport.error.data.appCode).toBe(route.body.code);
    expect(transport.error.data.appCode).toBe("not-found");
    expect(transport.error.message).toBe(route.body.message);
    expect(transport.error.message).toBe(CORE_ERROR_MESSAGES["not-found"]);
    expect(transport.error.data.requestId).toBe(REQUEST_ID);
  });

  it("answers an AppError forbidden from a procedure with the route path's status and code", async () => {
    const route = await routeAnswer(new AppError(CORE_ERRORS.forbidden));
    const transport = await transportAnswer("forbidden");

    expect(route.status).toBe(403);
    expect(transport.status).toBe(route.status);
    expect(transport.error.data.appCode).toBe(route.body.code);
    expect(transport.error.data.appCode).toBe("forbidden");
    expect(transport.error.message).toBe(route.body.message);
    expect(transport.error.message).toBe(CORE_ERROR_MESSAGES.forbidden);
  });

  it("answers a module AppError with its own code and safe message at the route path's status", async () => {
    const route = await routeAnswer(
      new AppError(ENVELOPE_TEST_ERRORS["quota-exceeded"])
    );

    const transport = await transportAnswer("moduleQuota");

    expect(route.status).toBe(500);
    expect(route.body.code).toBe("envelope-test:quota-exceeded");
    expect(transport.status).toBe(route.status);
    expect(transport.error.data.appCode).toBe(route.body.code);
    expect(transport.error.data.appCode).toBe("envelope-test:quota-exceeded");
    expect(transport.error.message).toBe(route.body.message);
    expect(transport.error.message).toBe("The envelope test quota is used up.");
    expect(transport.error.message).not.toBe(
      CORE_ERROR_MESSAGES["internal-error"]
    );
  });

  it("answers a bare TRPCError FORBIDDEN with the forbidden app code and its status", async () => {
    const transport = await transportAnswer("bareForbidden");

    expect(transport.status).toBe(403);
    expect(transport.error.data.appCode).toBe("forbidden");
    expect(transport.error.data.appCode).not.toBe("internal-error");
    expect(transport.error.message).toBe(CORE_ERROR_MESSAGES.forbidden);
  });

  it("answers a bare TRPCError BAD_REQUEST with the invalid-input app code and its status", async () => {
    const transport = await transportAnswer("bareBadRequest");

    expect(transport.status).toBe(400);
    expect(transport.error.data.appCode).toBe("invalid-input");
    expect(transport.error.data.appCode).not.toBe("internal-error");
    expect(transport.error.message).toBe(CORE_ERROR_MESSAGES["invalid-input"]);
  });

  it("carries no cause or stack text in the envelope", async () => {
    const transport = await transportAnswer("bareLeaky");

    expect(transport.status).toBe(403);
    expect(transport.text).not.toContain("secret-upstream-detail");
    expect(transport.text).not.toMatch(/at \S+:\d+/);
    expect(transport.error.data).not.toHaveProperty("stack");
    expect(transport.error.data).not.toHaveProperty("path");
  });

  it("answers an unknown error with 500, the generic code and the generic message", async () => {
    const transport = await transportAnswer("unknownError");

    expect(transport.status).toBe(500);
    expect(transport.error.data.appCode).toBe("internal-error");
    expect(transport.error.message).toBe(CORE_ERROR_MESSAGES["internal-error"]);
    expect(transport.text).not.toContain("envelope_pkey");
    expect(transport.text).not.toContain("unique constraint");
    expect(transport.error.data.requestId).toBe(REQUEST_ID);
  });
});
