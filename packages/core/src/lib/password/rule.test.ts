import { describe, expect, it } from "vitest";

import {
  meetsPasswordRule,
  PASSWORD_MIN_LENGTH,
  passwordRuleRows,
} from "./rule.ts";

/**
 * R-64: the rule is one source for the client meter and the server check. `passwordRuleRows` is
 * what the meter renders, and the last row is neutral because the provisioning-password clause is
 * a save-time comparison the browser cannot make.
 */
describe("the password rule rows (R-64)", () => {
  it("marks length, classes and email as the person types", () => {
    const rows = passwordRuleRows("Abcdefghij1!xy", "admin@example.invalid");

    expect(rows.map((row) => [row.key, row.met])).toEqual([
      ["length", true],
      ["classes", true],
      ["notEmail", true],
      ["notProvisioning", null],
    ]);
  });

  it("reports each missing rule separately", () => {
    const short = passwordRuleRows("abcdefgh", "admin@example.invalid");

    expect(short.find((row) => row.key === "length")?.met).toBe(false);
    expect(short.find((row) => row.key === "classes")?.met).toBe(false);
    expect(short.find((row) => row.key === "notProvisioning")?.met).toBeNull();

    // An empty value is not judged against the email yet.
    expect(
      passwordRuleRows("", "admin@example.invalid").find(
        (row) => row.key === "notEmail"
      )?.met
    ).toBeNull();

    // The email itself fails the third rule.
    expect(
      passwordRuleRows("admin@example.invalid", "admin@example.invalid").find(
        (row) => row.key === "notEmail"
      )?.met
    ).toBe(false);
  });

  it("is the same predicate the server check reads", () => {
    const password = "Abcdefghij1!xy";

    expect(meetsPasswordRule(password, "admin@example.invalid")).toBe(true);
    expect(
      passwordRuleRows(password, "admin@example.invalid")
        .filter((row) => row.key !== "notProvisioning")
        .every((row) => row.met === true)
    ).toBe(true);
    expect(PASSWORD_MIN_LENGTH).toBe(14);
  });
});
