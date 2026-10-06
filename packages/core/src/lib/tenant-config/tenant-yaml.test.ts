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

  it("omits genie_studio_url by default, so the genie-studio client keeps no redirect URIs (R-49a)", () => {
    expect(tenantYamlSchema.parse(VALID).genie_studio_url).toBeUndefined();
  });

  it("accepts an https origin as genie_studio_url", () => {
    expect(
      tenantYamlSchema.parse({
        ...VALID,
        genie_studio_url: "https://studio.example.com",
      }).genie_studio_url
    ).toBe("https://studio.example.com");
  });

  it("accepts a plain-http loopback origin, where no other machine can reach it (R-4a)", () => {
    for (const value of [
      "http://localhost:3400",
      "http://127.0.0.1:3400",
      "http://[::1]:3400",
    ]) {
      expect(
        tenantYamlSchema.parse({ ...VALID, genie_studio_url: value })
          .genie_studio_url
      ).toBe(value);
    }
  });

  it("refuses plain http on a non-loopback host", () => {
    const result = tenantYamlSchema.safeParse({
      ...VALID,
      genie_studio_url: "http://studio.example.com",
    });

    expect(result.success).toBe(false);
  });

  it("refuses a genie_studio_url with userinfo, a path, a query or a fragment", () => {
    for (const value of [
      "https://user:secret@studio.example.com",
      "https://studio.example.com/app",
      "https://studio.example.com?x=1",
      "https://studio.example.com#top",
    ]) {
      expect(
        tenantYamlSchema.safeParse({ ...VALID, genie_studio_url: value })
          .success,
        value
      ).toBe(false);
    }
  });

  it("refuses a wildcard host and port 0 with a named cause (R-49a)", () => {
    const cases = [
      { value: "https://*.example.com", message: "wildcard host" },
      { value: "https://studio.example.com:0", message: "port 0" },
    ];

    for (const { value, message } of cases) {
      const result = tenantYamlSchema.safeParse({
        ...VALID,
        genie_studio_url: value,
      });

      expect(result.success, value).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(message);
      }
    }
  });
});
