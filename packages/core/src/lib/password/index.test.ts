import { describe, expect, it } from "vitest";

import {
  characterClassCount,
  generatePassword,
  meetsPasswordRule,
  PASSWORD_MIN_LENGTH,
} from "./index.ts";

describe("the shared password rule (R-64)", () => {
  it("requires the minimum length, three classes and a password other than the email", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(14);

    expect(meetsPasswordRule("Abcdefghij1!xy", "admin@example.invalid")).toBe(
      true
    );

    // Thirteen characters is one short of the minimum.
    expect(
      meetsPasswordRule("Abcdefghij1!xy".slice(1), "admin@example.invalid")
    ).toBe(false);

    // Two classes only.
    expect(meetsPasswordRule("abcdefghijklmnop", "admin@example.invalid")).toBe(
      false
    );

    // The email itself can never be the password, whatever its length.
    expect(
      meetsPasswordRule("admin@example.invalid", "admin@example.invalid")
    ).toBe(false);

    // Case folds, because an email is compared lower-cased.
    expect(
      meetsPasswordRule("ADMIN@EXAMPLE.INVALID", "admin@example.invalid")
    ).toBe(false);
  });

  it("counts the four classes", () => {
    expect(characterClassCount("abcdefghijklmnop")).toBe(1);
    expect(characterClassCount("abcdefghijkl1")).toBe(2);
    expect(characterClassCount("abcdefghij1!")).toBe(3);
    expect(characterClassCount("Abcdefghij1!")).toBe(4);
  });
});

describe("the generated password", () => {
  it("meets R-64 and is not the account email", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const password = generatePassword();

      expect(password).toHaveLength(20);
      expect(meetsPasswordRule(password, "break-glass@example.invalid")).toBe(
        true
      );
      expect(characterClassCount(password)).toBe(4);
    }
  });

  it("does not repeat across calls", () => {
    const passwords = new Set(
      Array.from({ length: 50 }, () => generatePassword())
    );

    expect(passwords.size).toBe(50);
  });
});
