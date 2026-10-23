import { describe, expect, it } from "vitest";

import {
  AppError,
  CORE_ERROR_MESSAGES,
  safeBodyFor,
} from "../../lib/errors/index.ts";
import { ModuleManagementError } from "./index.ts";

describe("ModuleManagementError", () => {
  it("keeps its operator text beside the catalogue message", () => {
    const issues = [{ path: "endpoint", message: "Invalid url" }];

    const error = new ModuleManagementError(
      "module-config-invalid",
      "module-config-invalid: x endpoint: Invalid url",
      issues
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("module-config-invalid");
    expect(error.message).toBe(
      "module-config-invalid: x endpoint: Invalid url"
    );
    expect(error.safeMessage).toBe(
      CORE_ERROR_MESSAGES["module-config-invalid"]
    );
    expect(error.issues).toEqual(issues);
    expect(JSON.stringify(safeBodyFor(error, "r1"))).not.toContain(
      "x endpoint"
    );
  });
});
