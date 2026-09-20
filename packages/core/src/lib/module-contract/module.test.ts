import { describe, expect, it } from "vitest";

import { validModule } from "./__fixtures__/valid-module.ts";
import { SETTINGS_BASE_PERMISSION } from "./module.ts";

describe("SETTINGS_BASE_PERMISSION", () => {
  it("is the core settings permission, not a module key", () => {
    expect(SETTINGS_BASE_PERMISSION).toBe("core:settings:manage");
  });
});

describe("validModule fixture", () => {
  it("declares the identity, keys and navigation the contract fixes", () => {
    expect(validModule.identity.id).toBe("fixture");
    expect(validModule.permissions.map((p) => p.key)).toEqual([
      "fixture:read",
      "fixture:use",
      "fixture:admin",
    ]);
    expect(validModule.navigation.pinned).toHaveLength(3);
  });

  it("carries one configuration field of each of the five kinds (DEC-28)", () => {
    expect(Object.keys(validModule.configuration?.fields ?? {})).toEqual([
      "title",
      "pageSize",
      "enabled",
      "mode",
      "tags",
    ]);
  });

  it("contributes one HTTPS frame origin", async () => {
    await expect(
      validModule.contentSecurityPolicy?.frameOrigins()
    ).resolves.toEqual(["https://embed.fixture.example.com"]);
  });
});
