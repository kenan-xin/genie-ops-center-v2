import { afterEach, describe, expect, it } from "vitest";

import { ENTRA_SECRET, entraTenantFromEnv } from "./tenant.ts";

const VALID = {
  tenantId: "00000000-0000-4000-8000-000000000000",
  clientId: "00000000-0000-4000-8000-000000000001",
  clientSecret: "client-secret-value",
  groupId: "00000000-0000-4000-8000-000000000002",
  parentGroupId: "00000000-0000-4000-8000-000000000003",
  assigned: { email: "assigned@example.com", password: "assigned-password" },
  unassigned: {
    email: "unassigned@example.com",
    password: "unassigned-password",
  },
};

/** The message `entraTenantFromEnv` throws for one secret value. */
function refusal(value: string): string {
  process.env[ENTRA_SECRET] = value;

  try {
    entraTenantFromEnv();
  } catch (error) {
    if (!(error instanceof Error)) throw error;

    expect(error.cause).toBeUndefined();

    return error.message;
  }

  throw new Error("the secret was accepted");
}

describe("the ENTRA_TEST_TENANT secret", () => {
  afterEach(() => {
    delete process.env[ENTRA_SECRET];
  });

  it("skips when the secret is absent or blank", () => {
    expect(entraTenantFromEnv()).toBeUndefined();

    process.env[ENTRA_SECRET] = "  ";

    expect(entraTenantFromEnv()).toBeUndefined();
  });

  it("parses a complete secret", () => {
    process.env[ENTRA_SECRET] = JSON.stringify(VALID);

    expect(entraTenantFromEnv()?.groupId).toBe(VALID.groupId);
  });

  it("refuses a value that is not JSON without echoing any part of it", () => {
    for (const value of ["hunter2-secret", "tenant=0b1c,secret=abc"]) {
      const message = refusal(value);

      expect(message).toBe(`${ENTRA_SECRET} is not valid JSON`);
      expect(message).not.toContain(value.slice(0, 4));
    }
  });

  it("names only the paths of a malformed object, never its values", () => {
    const message = refusal(
      JSON.stringify({ ...VALID, clientSecret: "", tenantId: "not-a-uuid" })
    );

    expect(message).toContain("tenantId");
    expect(message).toContain("clientSecret");
    expect(message).not.toContain("not-a-uuid");
    expect(message).not.toContain("assigned-password");
  });
});
