import { describe, expect, it } from "vitest";

import { brandingSeedSchema } from "./branding-seed.ts";

const VALID = {
  company_name: "Example Group",
  product_name: "Example Ops",
  primary_color: "#1d4ed8",
  default_theme: "system",
  text_color: "#0f172a",
  login_background_color: "#f8fafc",
  login_welcome_text: "Sign in to Example Ops",
  login_notice_requires_acknowledgement: true,
  email_sender_name: "Example Ops",
  email_reply_to: "support@example.com",
  email_footer_text: "Example Group",
  default_locale: "en",
  default_time_zone: "Europe/Berlin",
  date_format: "dd/MM/yyyy",
  number_format: "de-DE",
};

describe("brandingSeedSchema", () => {
  it("accepts a complete file, which carries no $schema after the loader strips it", () => {
    expect(brandingSeedSchema.parse(VALID)).toEqual(VALID);
  });

  it("accepts a file that omits every optional column", () => {
    expect(brandingSeedSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a complete file carrying every optional column", () => {
    const complete = {
      ...VALID,
      logo_light_file_id: "file_light",
      logo_dark_file_id: "file_dark",
      logo_mark_file_id: "file_mark",
      favicon_file_id: "file_favicon",
      font_family: "plus-jakarta-sans",
      font_size: "default",
      login_background_file_id: "file_bg",
      login_notice_text: "For authorized use only.",
      support_url: "https://support.example.com",
      support_email: "support@example.com",
      terms_url: "https://example.com/terms",
      privacy_url: "https://example.com/privacy",
    };

    expect(brandingSeedSchema.parse(complete)).toEqual(complete);
  });

  it("rejects an unknown key", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      modules: ["placeholder"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a bookkeeping column the database owns, such as updated_at", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      updated_at: "2026-09-21T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a colour that is not a hex value", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      primary_color: "blue",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range enum value", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      font_size: "huge",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a theme outside the three the column allows", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      default_theme: "sepia",
    });

    expect(result.success).toBe(false);
  });

  it("rejects primary_foreground, a derived column an author must not write", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      primary_foreground: "#ffffff",
    });

    expect(result.success).toBe(false);
  });

  it("rejects the $schema key, which the loader must strip before parsing", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      $schema: "../../../deploy/schemas/branding.seed.schema.json",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a reply-to address that is not an email address", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      email_reply_to: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a support email that is not an email address", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      support_email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a support URL that is not HTTP or HTTPS", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      support_url: "ftp://files.example.com",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a terms URL that is not HTTP or HTTPS", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      terms_url: "ftp://files.example.com",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a privacy URL that is not HTTP or HTTPS", () => {
    const result = brandingSeedSchema.safeParse({
      ...VALID,
      privacy_url: "ftp://files.example.com",
    });

    expect(result.success).toBe(false);
  });
});
