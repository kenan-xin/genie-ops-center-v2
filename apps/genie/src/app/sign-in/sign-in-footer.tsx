import { httpUrl, supportContact } from "@genie/core/branding-support";
import { focusRing } from "@genie/ui";

export type SignInFooterProps = {
  readonly productName: string;
  readonly supportEmail: string | null;
  readonly supportUrl: string | null;
  readonly termsUrl: string | null;
  readonly privacyUrl: string | null;
  readonly termsLabel: string;
  readonly privacyLabel: string;
};

const LINK_CLASS = `rounded-sm hover:text-foreground hover:underline ${focusRing}`;

/**
 * The sign-in footer: the support contact, the terms and privacy links, and the product name.
 * Core's two rules decide what becomes a link, so a stored `javascript:` value never does.
 */
export function SignInFooter({
  productName,
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

  return (
    <footer className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
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
      </nav>
      <p>{productName}</p>
    </footer>
  );
}
