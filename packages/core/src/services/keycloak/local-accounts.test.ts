import { describe, expect, it } from "vitest";

import { SSO_DOMAIN } from "./local-accounts.ts";

/**
 * R-58a: a `--sso-domain` value is a lower-case domain name without `@`. A value that no email
 * domain can equal would be stored, and the R-40b refusal would never fire for it.
 */
describe("SSO_DOMAIN", () => {
  it.each([
    ["company.example", true],
    ["eu.company.example", true],
    ["xn--bcher-kva.example", true],
    ["Company.example", false],
    ["@company.example", false],
    ["a@company.example", false],
    ["company.example.", false],
    ["company", false],
    ["company..example", false],
    ["", false],
  ])("answers %j with %s", (value, accepted) => {
    expect(SSO_DOMAIN.safeParse(value).success).toBe(accepted);
  });
});
