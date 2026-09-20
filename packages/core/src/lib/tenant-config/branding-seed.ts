import { z } from "zod";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const HTTP_URL = { protocol: /^https?$/ } as const;

/**
 * Exactly the tenant_branding columns. The file carries a `$schema` key for editors; the loader
 * strips it before parsing, and this schema validates what remains (DEC-35). The admin portal
 * replaces these values after go-live, so this file seeds and never governs.
 */
export const brandingSeedSchema = z.strictObject({
  company_name: z.string().min(1),
  product_name: z.string().min(1),
  // Nullable columns: the seed may omit them, and the row stores null.
  // No document marks these nullable; the design section's Branding type does.
  logo_light_file_id: z.string().min(1).nullish(),
  logo_dark_file_id: z.string().min(1).nullish(),
  logo_mark_file_id: z.string().min(1).nullish(),
  favicon_file_id: z.string().min(1).nullish(),
  primary_color: z.string().regex(HEX_COLOR, "a colour is a six digit hex value"),
  // Derived: genie-ops setup computes primary_foreground from primary_color with the same shared
  // rule a branding save uses (white or near-black by relative luminance,
  // docs/design/reference/sections/branding/components/helpers.ts line 184, DEC-47).
  // Bead genie-ops-center-v2-1rd.3.1 tracks it; the file never authors it.
  default_theme: z.enum(["light", "dark", "system"]),
  // Documented default `plus-jakarta-sans`, so the key may be omitted.
  font_family: z.enum(["plus-jakarta-sans", "ibm-plex-sans", "manrope", "source-serif-4"]).optional(),
  // Documented default `default`, so the key may be omitted.
  font_size: z.enum(["compact", "default", "large"]).optional(),
  text_color: z.string().regex(HEX_COLOR, "a colour is a six digit hex value"),
  // Unresolved like the other file ids: optional because the design section's Branding type
  // makes it nullable, not because data-shape.md marks it so.
  login_background_file_id: z.string().min(1).nullish(),
  // No document marks these three settled or defaulted; required only because no default is
  // documented, and a default may exist in the database.
  login_background_color: z.string().regex(HEX_COLOR, "a colour is a six digit hex value"),
  login_welcome_text: z.string().min(1),
  // The system-use notice is nullable in data-shape.
  login_notice_text: z.string().min(1).nullish(),
  login_notice_requires_acknowledgement: z.boolean(),
  email_sender_name: z.string().min(1),
  email_reply_to: z.email(),
  email_footer_text: z.string().min(1),
  // Nullable address columns: an unset address renders no footer entry.
  support_url: z.url(HTTP_URL).nullish(),
  support_email: z.email().nullish(),
  terms_url: z.url(HTTP_URL).nullish(),
  privacy_url: z.url(HTTP_URL).nullish(),
  // No documented default for any of the four locale columns.
  default_locale: z.string().min(1),
  default_time_zone: z.string().min(1),
  date_format: z.string().min(1),
  number_format: z.string().min(1),
});

export type BrandingSeed = z.infer<typeof brandingSeedSchema>;
