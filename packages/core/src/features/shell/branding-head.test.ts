import { colorRoles } from "@genie/ui/tokens";
import { describe, expect, it } from "vitest";

import { brandingHead } from "./branding-head.tsx";

const stored = {
  primaryColor: "#123456",
  primaryForeground: "#ffffff",
  fontSize: "default",
  loginBackgroundColor: null,
};

describe("brandingHead", () => {
  it.each(["light", "dark"] as const)(
    "pins a %s organization theme with no device script",
    (defaultTheme) => {
      const head = brandingHead({ ...stored, defaultTheme });

      expect(head.theme).toBe(defaultTheme);
      expect(head.followDeviceScript).toBeUndefined();
      expect(head.rootCss).toMatch(/^:root\{.*--primary:#123456;.*\}$/);
    }
  );

  it("follows the device when the organization theme is system (R-17)", () => {
    const head = brandingHead({ ...stored, defaultTheme: "system" });

    expect(head.theme).toBe("light");
    expect(head.followDeviceScript).toContain("prefers-color-scheme: dark");
  });

  it("emits the packages/ui defaults and follows the device with no branding row (R-12a)", () => {
    const head = brandingHead(undefined);

    expect(head.theme).toBe("light");
    expect(head.followDeviceScript).toBeDefined();
    expect(head.rootCss).toContain(`--primary:${colorRoles.light.primary};`);
  });
});
