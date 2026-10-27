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
      issues,
    });
  });

  // A generic text says nothing a person can act on, so the save copy replaces it (empty message).
  it.each([
    ["a fetch that failed", new TypeError("Failed to fetch"), "network", ""],
    [
      "a request that timed out",
      new DOMException("Timed out", "TimeoutError"),
      "timeout",
      "",
    ],
    ["a gateway timeout", new ORPCError("GATEWAY_TIMEOUT"), "timeout", ""],
    ["an origin refusal", new ORPCError("FORBIDDEN"), "refused", ""],
    [
      "a missing permission",
      refusedWith("forbidden", 403, "You may not do that."),
      "refused",
      "",
    ],
    [
      "a refusal the status table misses",
      refusedWith("last-administrator", 500, "No administrator would stay."),
      "refused",
      "No administrator would stay.",
    ],
    [
      "a change made elsewhere",
      refusedWith("categories-changed", 409, "The categories changed."),
      "conflict",
      "The categories changed.",
    ],
    [
      "a malformed request",
      refusedWith("invalid-input", 400, "The request was not valid."),
      "invalid",
      "",
    ],
    [
      "a server fault",
      refusedWith("internal-error", 500, "Something went wrong."),
      "unknown",
      "",
    ],
    [
      "an unread server answer",
      new ORPCError("INTERNAL_SERVER_ERROR"),
      "unknown",
      "",
    ],
  ])("reads %s as its kind", (_name, cause, kind, message) => {
    expect(refusalOf(cause)).toEqual({ kind, message });
  });
});
