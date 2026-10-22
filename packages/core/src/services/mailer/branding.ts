import { primaryPair } from "../../lib/branding/tokens.ts";
import type { TenantBranding } from "../../lib/tenant-context/readers.ts";
import type { MailBrandingTheme } from "./catalogue.ts";

/** The branding values a mailer reads: the sender name and every value the layout shows. */
export type MailBranding = Pick<
  TenantBranding,
  | "companyName"
  | "productName"
  | "primaryColor"
  | "primaryForeground"
  | "emailSenderName"
  | "emailReplyTo"
  | "emailFooterText"
  | "supportEmail"
  | "supportUrl"
  | "termsUrl"
  | "privacyUrl"
>;

/**
 * The reply-to header value, or undefined when unset. The seed validates it as an email address;
 * CR and LF are still removed, so branding cannot inject a header (R-43).
 */
export function mailReplyTo(branding: MailBranding): string | undefined {
  return (
    optional(branding.emailReplyTo?.replace(/[\r\n]+/g, "") ?? null) ??
    undefined
  );
}

function optional(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

/**
 * The branding row as the typed object the templates read (R-59a). The stored foreground is used
 * as saved and never recomputed (R-55), and the pair rule is the web token layer's.
 */
export function mailBrandingTheme(branding: MailBranding): MailBrandingTheme {
  const pair = primaryPair(branding);

  return {
    companyName: branding.companyName,
    productName: branding.productName,
    primaryColor: pair.primary,
    primaryForeground: pair.foreground,
    footerText: optional(branding.emailFooterText),
    supportEmail: optional(branding.supportEmail),
    supportUrl: optional(branding.supportUrl),
    termsUrl: optional(branding.termsUrl),
    privacyUrl: optional(branding.privacyUrl),
  };
}
