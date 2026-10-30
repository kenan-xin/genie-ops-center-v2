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
  "record-locked": { message: "That record is in use.", status: 409 },
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

  it("carries its issues as a frozen copy", () => {
    const source = [{ path: "title", message: "Required" }];

    const error = new AppError(CORE_ERRORS["internal-error"], {
      issues: source,
    });

    source.push({ path: "extra", message: "Late" });
    source[0] = { path: "changed", message: "Changed" };

    expect(error.issues).toEqual([{ path: "title", message: "Required" }]);
    expect(Object.isFrozen(error.issues)).toBe(true);
    expect(Object.isFrozen(error.issues?.[0])).toBe(true);
    expect(() => Object.assign(error, { issues: [] })).toThrow(TypeError);
    expect(new AppError(CORE_ERRORS["internal-error"]).issues).toBeUndefined();
  });

  it("freezes every core definition", () => {
    expect(Object.isFrozen(CORE_ERRORS)).toBe(true);
    expect(Object.isFrozen(CORE_ERRORS["internal-error"])).toBe(true);
  });
});

describe("safeBodyFor", () => {
  it("reports migration failure without promising cross-history rollback", () => {
    const body = safeBodyFor(
      new AppError(CORE_ERRORS["migration-failed"]),
      REQUEST_ID
    );

    expect(body).toEqual({
      code: "migration-failed",
      message: "A database migration did not finish. The server did not start.",
      requestId: REQUEST_ID,
    });
  });

  it("carries the issues of a refused write, and no issues key without them", () => {
    const body = safeBodyFor(
      new AppError(CORE_ERRORS["module-config-invalid"], {
        issues: [{ path: "endpoint", message: "Invalid url" }],
      }),
      "r1"
    );

    expect(body).toEqual({
      code: "module-config-invalid",
      message: CORE_ERROR_MESSAGES["module-config-invalid"],
      requestId: "r1",
      issues: [{ path: "endpoint", message: "Invalid url" }],
    });

    expect(
      Object.keys(safeBodyFor(new AppError(CORE_ERRORS.forbidden), "r1"))
    ).not.toContain("issues");
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

    // A definition assembled at the throw site is refused: its code is neither a
    // core catalogue entry nor a definition this module declared.
    expect(() => new AppError({ code: upstream, message: upstream })).toThrow(
      "not a declared error"
    );

    // A forged module code has the right shape and is still refused, because the
    // mark a declared definition carries cannot be written by a caller.
    expect(
      () =>
        new AppError({
          code: "placeholder:record-locked",
          message: upstream,
        })
    ).toThrow("not a declared error");

    // A real core code with a caller's message keeps the catalogue's message.
    const forgedCore = new AppError({
      code: "internal-error",
      message: upstream,
    });

    expect(forgedCore.safeMessage).toBe(CORE_ERROR_MESSAGES["internal-error"]);

    expect(JSON.stringify(safeBodyFor(forgedCore, REQUEST_ID))).not.toContain(
      "duplicate key"
    );

    // A copy of a declared module definition with the message replaced is
    // refused as well: the copy loses the mark.
    expect(
      () =>
        new AppError({
          ...placeholderErrors["record-locked"],
          message: upstream,
        })
    ).toThrow("not a declared error");

    // The path a transport takes: it hands over what it caught, and a caught
    // error becomes the generic entry with none of its text.
    const body = safeBodyFor(new Error(upstream), REQUEST_ID);

    expect(body.code).toBe(GENERIC_ERROR_CODE);
    expect(JSON.stringify(body)).not.toContain("duplicate key");
  });

  it("keeps its code and message after a later assignment", () => {
    const upstream = 'relation "placeholder_record" does not exist';
    const error = new AppError(CORE_ERRORS["migration-failed"]);

    // The fields are not writable, so the assignment itself fails in strict mode.
    expect(() =>
      Object.assign(error, { code: "forged", safeMessage: upstream })
    ).toThrow(TypeError);

    const body = safeBodyFor(error, REQUEST_ID);

    expect(body).toEqual({
      code: "migration-failed",
      message: CORE_ERROR_MESSAGES["migration-failed"],
      requestId: REQUEST_ID,
    });

    expect(JSON.stringify(body)).not.toContain("placeholder_record");
  });

  it("keeps both generic paths after an attempt to rewrite the catalogue", () => {
    const canonical = CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE];
    const forged = "Stack trace: at Object.query (pg/lib/client.js:1)";

    // The catalogue is frozen, so the assignment fails rather than passing quietly.
    expect(() => {
      Object.assign(CORE_ERROR_MESSAGES, { [GENERIC_ERROR_CODE]: forged });
    }).toThrow(TypeError);

    expect(safeMessageFor("a-code-nobody-declared")).toBe(canonical);

    expect(safeBodyFor(new Error(forged), REQUEST_ID)).toEqual({
      code: GENERIC_ERROR_CODE,
      message: canonical,
      requestId: REQUEST_ID,
    });
  });

  it("keeps the cause and the stack an error needs for the log", () => {
    const cause = new Error("connection refused");
    const error = new AppError(CORE_ERRORS["migration-failed"], { cause });

    expect(error.cause).toBe(cause);
    expect(error.stack).toContain("AppError");
  });

  it("refuses a module error code or message the contract does not allow", () => {
    expect(() =>
      defineModuleErrors("Placeholder", {
        ok: { message: "Fine.", status: 409 },
      })
    ).toThrow("kebab-case");

    expect(() =>
      defineModuleErrors("placeholder", {
        "record locked": { message: "Fine.", status: 409 },
      })
    ).toThrow("kebab-case");

    expect(() =>
      defineModuleErrors("placeholder", {
        "record-locked": { message: "  ", status: 409 },
      })
    ).toThrow("no message");
  });

  it("freezes a module's definitions, so no later code rewrites a message", () => {
    expect(Object.isFrozen(placeholderErrors)).toBe(true);
    expect(Object.isFrozen(placeholderErrors["record-locked"])).toBe(true);
  });
});
