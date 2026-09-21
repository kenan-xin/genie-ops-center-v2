import { AppError, CORE_ERRORS } from "@genie/core";
import { describe, expect, it } from "vitest";

import { errorResponse } from "./http-errors.ts";

describe("errorResponse", () => {
  it("returns the catalogue code, safe message and request id", async () => {
    const response = errorResponse(
      new AppError(CORE_ERRORS["not-found"]),
      "req-1"
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "not-found",
      message: CORE_ERRORS["not-found"].message,
      requestId: "req-1",
    });
  });

  it("maps an unknown exception to the generic entry and leaks nothing", async () => {
    const leak = new Error(
      'relation "placeholder_record" does not exist at 127.0.0.1:5432'
    );

    const response = errorResponse(leak, "req-2");
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("placeholder_record");
    expect(body).not.toContain("127.0.0.1");
    expect(body).not.toContain("Error:");
    expect(JSON.parse(body)).toEqual({
      code: "internal-error",
      message: CORE_ERRORS["internal-error"].message,
      requestId: "req-2",
    });
  });
});
