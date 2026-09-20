import { describe, expect, it } from "vitest";

import { brandingSeedSchema } from "./branding-seed.ts";

// docs/architecture/branding-seed.md: only these four are required customer values.
const REQUIRED_ONLY = {
  company_name: "Example Group",
  product_name: "Example Ops",
  default_locale: "en",
  default_time_zone: "Europe/Berlin",
};

// Every column the contract makes optional, supplied.
const COMPLETE = {
  ...REQUIRED_ONLY,
  logo_light_file_id: "file_light",
  logo_dark_file_id: "file_dark",
  logo_mark_file_id: "file_mark",
  favicon_file_id: "file_favicon",
  primary_color: "#1d4ed8",
  default_theme: "dark",
  font_family: "plus-jakarta-sans",
  font_size: "default",
  text_color: "#0f172a",
  login_background_file_id: "file_bg",
  login_background_color: "#f8fafc",
  login_welcome_text: "Sign in to Example Ops",
  login_notice_text: "For authorized use only.",
  login_notice_requires_acknowledgement: true,
  email_sender_name: "Example Ops",
  email_reply_to: "support@example.com",
  email_footer_text: "Example Group",
  support_url: "https://support.example.com",
  support_email: "support@example.com",
  terms_url: "https://example.com/terms",
  privacy_url: "https://example.com/privacy",
  date_format: "dd/MM/yyyy",
  number_format: "de-DE",
};

// The columns the approved contract made optional after this schema first required them.
const NEWLY_OPTIONAL = [
  "primary_color",
  "default_theme",
  "text_color",
  "login_background_color",
  "login_welcome_text",
  "login_notice_requires_acknowledgement",
  "email_sender_name",
  "email_reply_to",
  "email_footer_text",
  "date_format",
  "number_format",
] as const satisfies readonly (keyof typeof COMPLETE)[];

describe("brandingSeedSchema", () => {
  it("accepts a minimal file: the four required values only", () => {
    expect(brandingSeedSchema.parse(REQUIRED_ONLY)).toEqual(REQUIRED_ONLY);
  });

  it("accepts a complete file, which carries no $schema after the loader strips it", () => {
    expect(brandingSeedSchema.parse(COMPLETE)).toEqual(COMPLETE);
  });

  it.each(NEWLY_OPTIONAL)("accepts a file that omits %s", (column) => {
    const file: Partial<typeof COMPLETE> = { ...COMPLETE };
    delete file[column];

    expect(brandingSeedSchema.safeParse(file).success).toBe(true);
  });

  it("rejects an unknown key", () => {
    const result = brandingSeedSchema.safeParse({
      ...REQUIRED_ONLY,
      modules: ["placeholder"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a bookkeeping column the database owns, such as updated_at", () => {
    const result = brandingSeedSchema.safeParse({
      ...REQUIRED_ONLY,
      updated_at: "2026-09-21T00:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects primary_foreground, a derived column an author must not write", () => {
    const result = brandingSeedSchema.safeParse({
      ...REQUIRED_ONLY,
      primary_foreground: "#ffffff",
    });

    expect(result.success).toBe(false);
  });

  it("rejects the $schema key, which the loader must strip before parsing", () => {
    const result = brandingSeedSchema.safeParse({
      ...REQUIRED_ONLY,
      $schema: "../../../deploy/schemas/branding.seed.schema.json",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a colour that is not a hex value", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      primary_color: "blue",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range enum value", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      font_size: "huge",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a theme outside the three the column allows", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      default_theme: "sepia",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a reply-to address that is not an email address", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      email_reply_to: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a support email that is not an email address", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      support_email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a support URL that is not HTTP or HTTPS", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      support_url: "ftp://files.example.com",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a terms URL that is not HTTP or HTTPS", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      terms_url: "ftp://files.example.com",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a privacy URL that is not HTTP or HTTPS", () => {
    const result = brandingSeedSchema.safeParse({
      ...COMPLETE,
      privacy_url: "ftp://files.example.com",
    });

    expect(result.success).toBe(false);
  });

  describe("login notice acknowledgement", () => {
    it("rejects an acknowledgement flag with no notice to acknowledge", () => {
      const result = brandingSeedSchema.safeParse({
        ...REQUIRED_ONLY,
        login_notice_requires_acknowledgement: true,
      });

      expect(result.success).toBe(false);
    });

    it("rejects an acknowledgement flag when the notice is explicitly null", () => {
      const result = brandingSeedSchema.safeParse({
        ...REQUIRED_ONLY,
        login_notice_text: null,
        login_notice_requires_acknowledgement: true,
      });

      expect(result.success).toBe(false);
    });

    it("accepts an acknowledgement flag when a notice is present", () => {
      const file = {
        ...REQUIRED_ONLY,
        login_notice_text: "For authorized use only.",
        login_notice_requires_acknowledgement: true,
      };

      expect(brandingSeedSchema.parse(file)).toEqual(file);
    });

    it("accepts a false acknowledgement flag with no notice", () => {
      const file = {
        ...REQUIRED_ONLY,
        login_notice_requires_acknowledgement: false,
      };

      expect(brandingSeedSchema.parse(file)).toEqual(file);
    });
  });
});
