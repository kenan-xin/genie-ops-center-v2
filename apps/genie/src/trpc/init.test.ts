import { AppError, CORE_ERRORS } from "@genie/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { type ErrorEnvelope, formatTrpcError } from "./init.ts";

describe("formatTrpcError", () => {
  it("derives the protocol code, status and catalogue code from an AppError cause", () => {
    // tRPC wraps a thrown AppError as INTERNAL_SERVER_ERROR, so the envelope
    // names the wrong condition; the formatter has to answer for the cause.
    const envelope: ErrorEnvelope = {
      message: "original",
      code: -32603,
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
    };

    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new AppError(CORE_ERRORS.forbidden),
      }),
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
    const envelope: ErrorEnvelope = {
      message: "original",
      code: -32603,
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
    };

    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        cause: new Error(
          'duplicate key value violates unique constraint "placeholder_pkey"'
        ),
      }),
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
    const envelope: ErrorEnvelope = {
      message: "original",
      code: -32603,
      data: {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        path: "placeholder.read",
        stack:
          'TRPCError: relation "placeholder_record" does not exist\n    at handle (server.js:1:2)',
      },
    };

    const result = formatTrpcError({
      envelope,
      error: new TRPCError({ code: "INTERNAL_SERVER_ERROR" }),
      requestId: "req-11",
    });

    const decoded = JSON.stringify(result);

    expect(decoded).not.toContain("placeholder_record");
    expect(decoded).not.toContain("server.js");
    expect(result.data).not.toHaveProperty("stack");
    expect(result.data).not.toHaveProperty("path");
  });
});
