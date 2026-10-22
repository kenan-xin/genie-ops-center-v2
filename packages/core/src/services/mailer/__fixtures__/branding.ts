import type { MailBranding } from "../branding.ts";

/** A branding row with every value the mailer reads, optional values unset unless overridden. */
export function mailBranding(
  overrides: Partial<MailBranding> = {}
): MailBranding {
  return {
    companyName: "Co",
    productName: "Genie Ops Center",
    primaryColor: null,
    primaryForeground: null,
    emailSenderName: null,
    emailReplyTo: null,
    emailFooterText: null,
    supportEmail: null,
    supportUrl: null,
    termsUrl: null,
    privacyUrl: null,
    ...overrides,
  };
}
