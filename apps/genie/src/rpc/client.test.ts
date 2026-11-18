import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { refusalOf } from "./client.ts";

const refusedWith = (appCode: string, status: number, message: string) =>
  new ORPCError(appCode, {
    status,
    message,
    data: { appCode, requestId: "req-3" },
  });

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
      kind: "refused",
      message: "Too many attempts.",
      code: "rate-limited",
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
      kind: "invalid",
      message: "The module configuration is not valid.",
      code: "module-config-invalid",
      issues,
    });
  });

  // A generic text says nothing a person can act on, so the save copy replaces it (empty message).
  it.each([
    [
      "a fetch that failed",
      new TypeError("Failed to fetch"),
      "network",
      "",
      undefined,
    ],
    [
      "a request that timed out",
      new DOMException("Timed out", "TimeoutError"),
      "timeout",
      "",
      undefined,
    ],
    [
      "a gateway timeout",
      new ORPCError("GATEWAY_TIMEOUT"),
      "timeout",
      "",
      undefined,
    ],
    ["an origin refusal", new ORPCError("FORBIDDEN"), "refused", "", undefined],
    [
      "a missing permission",
      refusedWith("forbidden", 403, "You may not do that."),
      "refused",
      "",
      "forbidden",
    ],
    [
      "a refusal the status table misses",
      refusedWith("invoices:locked", 500, "The invoice is locked."),
      "refused",
      "The invoice is locked.",
      "invoices:locked",
    ],
    [
      "a change made elsewhere",
      refusedWith("categories-changed", 409, "The categories changed."),
      "conflict",
      "The categories changed.",
      "categories-changed",
    ],
    [
      "a malformed request",
      refusedWith("invalid-input", 400, "The request was not valid."),
      "invalid",
      "",
      "invalid-input",
    ],
    [
      "a server fault",
      refusedWith("internal-error", 500, "Something went wrong."),
      "unknown",
      "",
      "internal-error",
    ],
    [
      "an unread server answer",
      new ORPCError("INTERNAL_SERVER_ERROR"),
      "unknown",
      "",
      undefined,
    ],
  ])("reads %s as its kind", (_name, cause, kind, message, code) => {
    expect(refusalOf(cause)).toEqual({ kind, message, code });
  });
});
