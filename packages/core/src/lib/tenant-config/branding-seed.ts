import { z } from "zod";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const HTTP_URL = { protocol: /^https?$/ } as const;

/**
 * The tenant_branding columns an author may seed, per docs/architecture/branding-seed.md
 * (approved 2026-09-21). Only `company_name`, `product_name`, `default_locale` and
 * `default_time_zone` are required; everything else is optional with contract-defined
 * omission behaviour. This schema materializes none of those defaults: an omitted value
 * simply stays absent after parsing, because default materialization is an open
 * implementation question in the contract, not a missing feature here.
 * Explicit `null` versus omitted key is the other question the contract leaves open. Every
 * optional column here is `.optional()`, never `.nullish()`, so omission is the one
 * mechanism a seed file has: that is the narrower reading, and widening it later breaks no
 * file that already validates. Bead genie-ops-center-v2-1rd.3.3 tracks the decision.
 * The file carries a `$schema` key for editors; the loader strips it
 * before parsing, and this schema validates what remains (DEC-35). The admin portal
 * replaces these values after go-live, so this file seeds and never governs.
 */
const brandingSeedColumns = {
  company_name: z.string().min(1),
  product_name: z.string().min(1),
  logo_light_file_id: z.string().min(1).optional(),
  logo_dark_file_id: z.string().min(1).optional(),
  logo_mark_file_id: z.string().min(1).optional(),
  favicon_file_id: z.string().min(1).optional(),
  // Derived: genie-ops setup computes primary_foreground from primary_color with the same shared
  // rule a branding save uses (white or near-black by relative luminance,
  // docs/design/reference/sections/branding/components/helpers.ts line 184, DEC-47).
  // Bead genie-ops-center-v2-1rd.3.1 tracks it; the file never authors it.
  primary_color: z
    .string()
    .regex(HEX_COLOR, "a colour is a six digit hex value")
    .optional(),
  default_theme: z.enum(["light", "dark", "system"]).optional(),
  font_family: z
    .enum(["plus-jakarta-sans", "ibm-plex-sans", "manrope", "source-serif-4"])
    .optional(),
  font_size: z.enum(["compact", "default", "large"]).optional(),
  text_color: z
    .string()
    .regex(HEX_COLOR, "a colour is a six digit hex value")
    .optional(),
  login_background_file_id: z.string().min(1).optional(),
  login_background_color: z
    .string()
    .regex(HEX_COLOR, "a colour is a six digit hex value")
    .optional(),
  login_welcome_text: z.string().min(1).optional(),
  login_notice_text: z.string().min(1).optional(),
  login_notice_requires_acknowledgement: z.boolean().optional(),
  email_sender_name: z.string().min(1).optional(),
  email_reply_to: z.email().optional(),
  email_footer_text: z.string().min(1).optional(),
  // Address columns: an omitted link or contact is hidden, per the contract.
  support_url: z.url(HTTP_URL).optional(),
  support_email: z.email().optional(),
  terms_url: z.url(HTTP_URL).optional(),
  privacy_url: z.url(HTTP_URL).optional(),
  // Locale and time zone must be explicit customer values, never inferred from the host;
  // date_format and number_format follow the tenant locale when omitted.
  default_locale: z.string().min(1),
  default_time_zone: z.string().min(1),
  date_format: z.string().min(1).optional(),
  number_format: z.string().min(1).optional(),
} as const;

export const brandingSeedSchema = z
  .strictObject(brandingSeedColumns)
  .refine(
    (seed) =>
      seed.login_notice_requires_acknowledgement !== true ||
      seed.login_notice_text !== undefined,
    {
      message:
        "login_notice_requires_acknowledgement requires login_notice_text: a person cannot acknowledge a notice that does not exist",
      path: ["login_notice_requires_acknowledgement"],
    }
  );

export type BrandingSeed = z.infer<typeof brandingSeedSchema>;
