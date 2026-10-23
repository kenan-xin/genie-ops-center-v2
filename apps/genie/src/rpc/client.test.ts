import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { refusalOf } from "./client.ts";

describe("refusalOf", () => {
  it("reads the catalogue message and the wait from a refusal the interceptor wrote", () => {
    const refusal = new ORPCError("rate-limited", {
      status: 429,
      message: "Too many attempts.",
      data: {
        appCode: "rate-limited",
        requestId: "req-1",
        retryAfterMinutes: 2,
      },
    });

    expect(refusalOf(refusal)).toEqual({
      message: "Too many attempts.",
      retryAfterMinutes: 2,
    });
  });

  it("carries the issues of a refused module enable", () => {
    const issues = [{ path: "endpoint", message: "Invalid url" }];

    const refusal = new ORPCError("module-config-invalid", {
      status: 400,
      message: "The module configuration is not valid.",
      data: { appCode: "module-config-invalid", requestId: "req-2", issues },
    });

    expect(refusalOf(refusal)).toEqual({
      message: "The module configuration is not valid.",
      issues,
    });
  });

  it("has no message for an answer written outside the interceptor", () => {
    // The origin refusal decodes to an ORPCError carrying only oRPC's fallback text.
    expect(refusalOf(new ORPCError("FORBIDDEN"))).toEqual({ message: "" });
  });

  it("has no message for a failure that is not a refusal", () => {
    expect(refusalOf(new TypeError("Failed to fetch"))).toEqual({
      message: "",
    });
  });
});
