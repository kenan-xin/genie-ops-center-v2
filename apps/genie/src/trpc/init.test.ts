import { AppError, CORE_ERRORS } from "@genie/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { formatTrpcError } from "./init.ts";

describe("formatTrpcError", () => {
  it("keeps the protocol code and adds the catalogue code and the request id", () => {
    const envelope = {
      message: "original",
      code: -32603,
      data: { code: "INTERNAL_SERVER_ERROR" },
    };

    const result = formatTrpcError({
      envelope,
      error: new TRPCError({
        code: "FORBIDDEN",
        cause: new AppError(CORE_ERRORS.forbidden),
      }),
      requestId: "req-9",
    });

    expect(result.code).toBe(-32603);
    expect(result.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(result.data.appCode).toBe("forbidden");
    expect(result.data.requestId).toBe("req-9");
    expect(result.message).toBe(CORE_ERRORS.forbidden.message);
  });

  it("maps an unknown cause to the generic entry and drops its text", () => {
    const envelope = {
      message: "original",
      code: -32603,
      data: { code: "INTERNAL_SERVER_ERROR" },
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
});
