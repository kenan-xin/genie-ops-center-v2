import { httpUrl, supportContact } from "@genie/core/features/branding";
import { focusRing } from "@genie/ui";

export type SignInFooterProps = {
  readonly supportEmail: string | null;
  readonly supportUrl: string | null;
  readonly termsUrl: string | null;
  readonly privacyUrl: string | null;
  readonly termsLabel: string;
  readonly privacyLabel: string;
};

const LINK_CLASS = `rounded-sm hover:text-foreground hover:underline ${focusRing}`;

/**
 * The sign-in footer: one muted line with the support contact and the terms and privacy links, or
 * nothing when none is set. Core's two rules decide what becomes a link, so a stored `javascript:`
 * value never does.
 */
export function SignInFooter({
  supportEmail,
  supportUrl,
  termsUrl,
  privacyUrl,
  termsLabel,
  privacyLabel,
}: SignInFooterProps) {
  const support = supportContact({ supportEmail, supportUrl });

  const terms = httpUrl(termsUrl);

  const privacy = httpUrl(privacyUrl);

  if (support === null && terms === null && privacy === null) return null;

  return (
    <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {support === null ? null : (
        <a href={support.href} className={LINK_CLASS}>
          {support.label}
        </a>
      )}
      {terms === null ? null : (
        <a href={terms} className={LINK_CLASS}>
          {termsLabel}
        </a>
      )}
      {privacy === null ? null : (
        <a href={privacy} className={LINK_CLASS}>
          {privacyLabel}
        </a>
      )}
    </footer>
  );
}
