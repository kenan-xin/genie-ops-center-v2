import { describe, expect, it } from "vitest";

import {
  type BreakGlassDecision,
  decideBreakGlass,
} from "./break-glass-step.ts";

const EMAIL = "break-glass@example.invalid";

const ordinary = { isBreakGlass: false, mustChangePassword: false };

const undelivered = { isBreakGlass: true, mustChangePassword: true };

const delivered = { isBreakGlass: true, mustChangePassword: false };

const credential = { id: "credential-row", providerId: "credential" };

const keycloak = { id: "keycloak-row", providerId: "keycloak" };

// The integration test keeps the identity-provider refusal of an ordinary person (R-62) against a
// real database; these rows pin every other branch.
describe("the break_glass step decision (R-57, R-62)", () => {
  it.each<
    [
      string,
      Parameters<typeof decideBreakGlass>[1],
      Parameters<typeof decideBreakGlass>[2],
      BreakGlassDecision["kind"],
      RegExp | undefined,
    ]
  >([
    [
      "creates the account for a new address",
      undefined,
      [],
      "create",
      undefined,
    ],
    [
      "refuses an ordinary credential user rather than handing them the bypass (R-57)",
      ordinary,
      [credential],
      "refuse",
      /refuses to mark .* ordinary person/,
    ],
    [
      "refuses a break-glass account that also has an identity-provider login (R-62)",
      undelivered,
      [credential, keycloak],
      "refuse",
      /identity-provider login/,
    ],
    [
      "refuses a break-glass account with no credential login (R-57)",
      delivered,
      [],
      "refuse",
      /no credential login/,
    ],
    [
      "keeps a delivered account untouched",
      delivered,
      [credential],
      "keep",
      undefined,
    ],
    [
      "rotates an undelivered credential",
      undelivered,
      [credential],
      "rotate",
      undefined,
    ],
  ])("%s", (_name, existing, accounts, kind, cause) => {
    const decision = decideBreakGlass(EMAIL, existing, accounts);

    expect(decision.kind).toBe(kind);

    if (decision.kind === "refuse") {
      expect(decision.cause).toMatch(cause ?? /never/);
      expect(decision.cause).toContain(EMAIL);
    }

    if (decision.kind === "rotate") {
      expect(decision.credentialId).toBe("credential-row");
    }
  });
});
