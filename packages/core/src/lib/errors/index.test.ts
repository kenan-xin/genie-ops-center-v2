import { describe, expect, it } from "vitest";

import {
  AppError,
  CORE_ERROR_MESSAGES,
  CORE_ERRORS,
  GENERIC_ERROR_CODE,
  defineModuleErrors,
  moduleErrorCode,
  safeBodyFor,
  safeMessageFor,
} from "./index.ts";

const placeholderErrors = defineModuleErrors("placeholder", {
  "record-locked": "That record is in use.",
});

const REQUEST_ID = "01JD0000000000000000000000";

describe("the catalogue", () => {
  it("gives every code one fixed safe message", () => {
    for (const [code, message] of Object.entries(CORE_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(safeMessageFor(code)).toBe(message);
    }
  });

  it("holds a generic entry for an error it does not know", () => {
    expect(CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE]).toBeDefined();
  });

  it("answers the generic message for a code it does not hold", () => {
    expect(safeMessageFor("invented-code")).toBe(
      CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE]
    );
  });

  it("names a module code as <id>:<code>", () => {
    expect(moduleErrorCode("placeholder", "record-locked")).toBe(
      "placeholder:record-locked"
    );
  });

  it("refuses a module id or code that is not kebab-case", () => {
    expect(() => moduleErrorCode("Placeholder", "record-locked")).toThrow(
      "kebab-case"
    );

    expect(() => moduleErrorCode("placeholder", "Record Locked")).toThrow(
      "kebab-case"
    );
  });
});

describe("AppError", () => {
  it("carries the catalogue message for its code", () => {
    const error = new AppError(CORE_ERRORS["environment-invalid"]);

    expect(error.code).toBe("environment-invalid");
    expect(error.safeMessage).toBe(CORE_ERROR_MESSAGES["environment-invalid"]);
  });

  it("keeps the original error as its cause", () => {
    const cause = new Error("connection to db:5432 refused for user genie");
    const error = new AppError(CORE_ERRORS["migration-failed"], { cause });

    expect(error.cause).toBe(cause);
  });

  it("freezes every core definition", () => {
    expect(Object.isFrozen(CORE_ERRORS)).toBe(true);
    expect(Object.isFrozen(CORE_ERRORS["internal-error"])).toBe(true);
  });
});

describe("safeBodyFor", () => {
  it("returns the code, the safe message and the request id", () => {
    const body = safeBodyFor(
      new AppError(CORE_ERRORS["migration-lock-timeout"]),
      REQUEST_ID
    );

    expect(body).toEqual({
      code: "migration-lock-timeout",
      message: CORE_ERROR_MESSAGES["migration-lock-timeout"],
      requestId: REQUEST_ID,
    });
  });

  it("maps an unknown error to the generic entry", () => {
    const body = safeBodyFor(
      new Error("relation placeholder_record does not exist"),
      REQUEST_ID
    );

    expect(body.code).toBe(GENERIC_ERROR_CODE);
    expect(body.message).toBe(CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE]);
  });

  it("never lets database or upstream text reach the body", () => {
    const database = new Error(
      'relation "placeholder_record" does not exist at character 15'
    );

    const wrapped = new AppError(CORE_ERRORS["migration-failed"], {
      cause: database,
    });

    for (const body of [
      safeBodyFor(database, REQUEST_ID),
      safeBodyFor(wrapped, REQUEST_ID),
    ]) {
      expect(JSON.stringify(body)).not.toContain("placeholder_record");
      expect(JSON.stringify(body)).not.toContain("character 15");
    }
  });

  it("exposes no stack trace and no cause", () => {
    const body = safeBodyFor(
      new AppError(CORE_ERRORS["internal-error"], { cause: new Error("deep") }),
      REQUEST_ID
    );

    expect(Object.keys(body).toSorted()).toEqual([
      "code",
      "message",
      "requestId",
    ]);
  });

  it("carries a module's defined code and its fixed message", () => {
    const body = safeBodyFor(
      new AppError(placeholderErrors["record-locked"]),
      REQUEST_ID
    );

    expect(body.code).toBe("placeholder:record-locked");
    expect(body.message).toBe("That record is in use.");
  });

  it("lets no caller put its own text into the response", () => {
    const upstream = 'duplicate key value violates unique constraint "x"';

    // A definition built from upstream text is refused by its code: a code is a
    // core catalogue entry or a module's `<id>:<code>`, never free text.
    expect(() => new AppError({ code: upstream, message: upstream })).toThrow(
      "catalogue code"
    );

    // The path a transport takes: it hands over what it caught, and a caught
    // error becomes the generic entry with none of its text.
    const body = safeBodyFor(new Error(upstream), REQUEST_ID);

    expect(body.code).toBe(GENERIC_ERROR_CODE);
    expect(JSON.stringify(body)).not.toContain("duplicate key");
  });

  it("refuses a module error code or message the contract does not allow", () => {
    expect(() => defineModuleErrors("Placeholder", { ok: "Fine." })).toThrow(
      "kebab-case"
    );

    expect(() =>
      defineModuleErrors("placeholder", { "record locked": "Fine." })
    ).toThrow("kebab-case");

    expect(() =>
      defineModuleErrors("placeholder", { "record-locked": "  " })
    ).toThrow("no message");
  });

  it("freezes a module's definitions, so no later code rewrites a message", () => {
    expect(Object.isFrozen(placeholderErrors)).toBe(true);
    expect(Object.isFrozen(placeholderErrors["record-locked"])).toBe(true);
  });

  it("still spells a module code as <id>:<code>", () => {
    expect(moduleErrorCode("placeholder", "record-locked")).toBe(
      "placeholder:record-locked"
    );
  });
});
