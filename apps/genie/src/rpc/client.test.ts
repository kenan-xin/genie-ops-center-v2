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
