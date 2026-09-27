import { describe, expect, it } from "vitest";

import { tenantYamlSchema } from "./tenant-yaml.ts";

const VALID = {
  modules: ["placeholder"],
  onboarding_mode: "invite",
  local_accounts: false,
  first_administrators: ["admin@example.com"],
  break_glass_email: "break-glass@example.com",
};

describe("tenantYamlSchema", () => {
  it("accepts a complete file", () => {
    expect(tenantYamlSchema.parse(VALID)).toEqual(VALID);
  });

  it("rejects an unknown key, so a value in the wrong file fails the generator", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      hosting_mode: "genie-hosted",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a branding value, because branding.seed.json owns it (DEC-35)", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      company_name: "Example",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an address that is not an email", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      break_glass_email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty first administrator list", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      first_administrators: [],
    });

    expect(result.success).toBe(false);
  });

  it("accepts an empty module list, because a customer can select none", () => {
    expect(tenantYamlSchema.parse({ ...VALID, modules: [] }).modules).toEqual(
      []
    );
  });

  it("accepts jit onboarding, the other documented mode", () => {
    expect(
      tenantYamlSchema.parse({ ...VALID, onboarding_mode: "jit" })
        .onboarding_mode
    ).toBe("jit");
  });

  it("rejects an onboarding mode outside the documented set", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      onboarding_mode: "open",
    });

    expect(result.success).toBe(false);
  });

  it("omits realm by default, so the column default managed applies", () => {
    expect(tenantYamlSchema.parse(VALID).realm).toBeUndefined();
  });

  it("accepts each documented realm mode", () => {
    expect(tenantYamlSchema.parse({ ...VALID, realm: "managed" }).realm).toBe(
      "managed"
    );
    expect(tenantYamlSchema.parse({ ...VALID, realm: "customer" }).realm).toBe(
      "customer"
    );
  });

  it("rejects a realm mode outside the documented set", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      realm: "bundled",
    });

    expect(result.success).toBe(false);
  });

  it("refuses realm customer together with local_accounts true (R-54a)", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      realm: "customer",
      local_accounts: true,
    });

    expect(result.success).toBe(false);
  });

  it("accepts realm customer with local accounts off, and managed with them on", () => {
    expect(
      tenantYamlSchema.parse({
        ...VALID,
        realm: "customer",
        local_accounts: false,
      }).realm
    ).toBe("customer");
    expect(
      tenantYamlSchema.parse({
        ...VALID,
        realm: "managed",
        local_accounts: true,
      }).realm
    ).toBe("managed");
  });
});
