import { describe, expect, it } from "vitest";

import { type BrandingDraft, brandingDraftSchema } from "./schemas.ts";

const VALID = {
  companyName: "Acme",
  productName: "Acme Ops",
  logoLightFileId: null,
  logoDarkFileId: null,
  logoMarkFileId: null,
  faviconFileId: null,
  primaryColor: "#2563eb",
  defaultTheme: "system",
  loginBackgroundColor: null,
  loginWelcomeText: "",
  loginNoticeText: "",
  loginNoticeRequiresAcknowledgement: false,
};

function issues(input: Partial<BrandingDraft>) {
  const result = brandingDraftSchema.safeParse({ ...VALID, ...input });

  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
}

describe("brandingDraftSchema", () => {
  it("parses a valid draft and turns empty texts into null", () => {
    const parsed = brandingDraftSchema.parse(VALID);

    expect(parsed.loginWelcomeText).toBeNull();
    expect(parsed.loginNoticeText).toBeNull();
  });

  it.each([
    [{ companyName: "  " }, "companyName", "Enter a company name."],
    [
      { productName: "x".repeat(81) },
      "productName",
      "Keep it to 80 characters.",
    ],
    [
      { primaryColor: "blue" },
      "primaryColor",
      "Enter a six-digit hex color, for example #2563eb.",
    ],
    [
      { primaryColor: "#93c5fd" },
      "primaryColor",
      "Fix the failing contrast checks first.",
    ],
    [
      { loginNoticeRequiresAcknowledgement: true },
      "loginNoticeRequiresAcknowledgement",
      "Add a notice first.",
    ],
  ])("refuses %o with one issue on %s", (input, path, message) => {
    expect(issues(input)).toEqual([{ path, message }]);
  });

  it("refuses a logo id that is not a uuid", () => {
    expect(issues({ logoMarkFileId: "not-a-uuid" })[0]?.path).toBe(
      "logoMarkFileId"
    );
  });
});
