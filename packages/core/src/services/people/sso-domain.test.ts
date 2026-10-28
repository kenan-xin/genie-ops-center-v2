import { describe, expect, it } from "vitest";

import { onSsoDomain } from "./sso-domain.ts";

describe("onSsoDomain (R-40b)", () => {
  it.each([
    ["a@company.example", ["company.example"], true],
    ["a@eu.company.example", ["company.example"], true],
    ["Ann@EU.Company.Example", ["company.example"], true],
    ["a@partner.example", ["other.example", "partner.example"], true],
    ["a@notcompany.example", ["company.example"], false],
    ["a@company.example.evil", ["company.example"], false],
    ["a@company.example", [], false],
  ] as const)("%s on %j answers %s", (email, domains, expected) => {
    expect(onSsoDomain(email, domains)).toBe(expected);
  });
});
