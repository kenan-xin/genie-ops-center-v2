import { AppError, CORE_ERRORS, CORE_ERROR_MESSAGES } from "@genie/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { type ErrorEnvelope, formatTrpcError } from "./init.ts";

const envelope: ErrorEnvelope = {
  message: "original",
  code: -32603,
  data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
};

describe("formatTrpcError", () => {
  it("derives the protocol code, status and catalogue code from an AppError cause", () => {
    // tRPC wraps a thrown AppError as INTERNAL_SERVER_ERROR, so the envelope
    // names the wrong condition; the formatter has to answer for the cause.
    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError(CORE_ERRORS.forbidden),
      }),
      authenticated: true,
      requestId: "req-9",
    });

    // The status tRPC reads back to set the HTTP response status, and the
    // protocol code that names the same condition.
    expect(result.data.httpStatus).toBe(403);
    expect(result.code).toBe(-32003);
    expect(result.data.code).toBe("FORBIDDEN");
    expect(result.data.appCode).toBe("forbidden");
    expect(result.data.requestId).toBe("req-9");
    expect(result.message).toBe(CORE_ERRORS.forbidden.message);
  });

  it("maps an unknown cause to the generic entry and drops its text", () => {
    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new Error(
          'duplicate key value violates unique constraint "placeholder_pkey"'
        ),
      }),
      authenticated: true,
      requestId: "req-10",
    });

    expect(result.data.appCode).toBe("internal-error");
    expect(result.data.requestId).toBe("req-10");
    expect(result.message).not.toContain("placeholder_pkey");
    expect(result.message).not.toContain("unique constraint");
  });

  it("drops the stack and the path tRPC adds to the envelope", () => {
    // tRPC sets `data.stack` whenever NODE_ENV is not "production", and a
    // TRPCError's stack begins with the wrapped cause's message, so the leak
    // does not depend on the environment this formatter runs in.
    const result = formatTrpcError({
      envelope: {
        message: "original",
        code: -32603,
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          path: "placeholder.read",
          stack:
            'TRPCError: relation "placeholder_record" does not exist\n    at handle (server.js:1:2)',
        },
      },
      error: new TRPCError({ code: "INTERNAL_SERVER_ERROR" }),
      authenticated: true,
      requestId: "req-11",
    });

    const decoded = JSON.stringify(result);

    expect(decoded).not.toContain("placeholder_record");
    expect(decoded).not.toContain("server.js");
    expect(result.data).not.toHaveProperty("stack");
    expect(result.data).not.toHaveProperty("path");
  });

  it("maps a bare TRPCError UNAUTHORIZED to the unauthenticated code at 401", () => {
    const result = formatTrpcError({
      envelope,
      error: new TRPCError({ code: "UNAUTHORIZED" }),
      authenticated: false,
      requestId: "req-12",
    });

    expect(result.data.httpStatus).toBe(401);
    expect(result.data.code).toBe("UNAUTHORIZED");
    expect(result.code).toBe(-32001);
    expect(result.data.appCode).toBe("unauthenticated");
    expect(result.data.appCode).not.toBe("internal-error");
    expect(result.message).toBe(CORE_ERRORS.unauthenticated.message);
  });

  it("answers an anonymous caller's permission refusal as unauthenticated at 401", () => {
    // The real evaluator raises a catalogue `forbidden`; with no session that is
    // the condition a person can act on, so it is unauthenticated, not forbidden.
    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError(CORE_ERRORS.forbidden),
      }),
      authenticated: false,
      requestId: "req-13",
    });

    expect(result.data.httpStatus).toBe(401);
    expect(result.data.code).toBe("UNAUTHORIZED");
    expect(result.data.appCode).toBe("unauthenticated");
    expect(result.message).toBe(CORE_ERRORS.unauthenticated.message);
    expect(result.message).not.toBe(CORE_ERRORS.forbidden.message);
  });

  it("answers an anonymous caller's bare FORBIDDEN as unauthenticated at 401", () => {
    // A module's own check raises a bare tRPC FORBIDDEN rather than the catalogue
    // error; a request with no session reads the same unauthenticated answer.
    const result = formatTrpcError({
      envelope: {
        message: "original",
        code: -32003,
        data: { code: "FORBIDDEN", httpStatus: 403 },
      },
      error: new TRPCError({ code: "FORBIDDEN" }),
      authenticated: false,
      requestId: "req-14",
    });

    expect(result.data.httpStatus).toBe(401);
    expect(result.data.code).toBe("UNAUTHORIZED");
    expect(result.data.appCode).toBe("unauthenticated");
    expect(result.message).toBe(CORE_ERRORS.unauthenticated.message);
  });

  it("keeps a signed-in person's bare FORBIDDEN at 403", () => {
    const result = formatTrpcError({
      envelope: {
        message: "original",
        code: -32003,
        data: { code: "FORBIDDEN", httpStatus: 403 },
      },
      error: new TRPCError({ code: "FORBIDDEN" }),
      authenticated: true,
      requestId: "req-15",
    });

    expect(result.data.httpStatus).toBe(403);
    expect(result.data.code).toBe("FORBIDDEN");
    expect(result.data.appCode).toBe("forbidden");
    expect(result.message).toBe(CORE_ERROR_MESSAGES.forbidden);
  });

  it("keeps a refusal that is not a permission refusal unchanged for an anonymous caller", () => {
    // Not every refusal is about sign-in: a disabled module still answers
    // module-disabled at 403 even with no session.
    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError(CORE_ERRORS["module-disabled"]),
      }),
      authenticated: false,
      requestId: "req-16",
    });

    expect(result.data.httpStatus).toBe(403);
    expect(result.data.appCode).toBe("module-disabled");
  });
});
