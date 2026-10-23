export type SupportContact = {
  readonly label: string;
  readonly href: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * The one support link branding offers: a valid email wins, else an http(s) page, else none. Both
 * values are trimmed, so a blank or a `javascript:` value never becomes a link.
 */
export function supportContact(values: {
  readonly supportEmail: string | null;
  readonly supportUrl: string | null;
}): SupportContact | null {
  const email = values.supportEmail?.trim() ?? "";

  if (EMAIL.test(email)) {
    return { label: email, href: `mailto:${email}` };
  }

  const url = values.supportUrl?.trim() ?? "";

  if (URL.canParse(url) && /^https?:$/.test(new URL(url).protocol)) {
    return { label: url, href: url };
  }

  return null;
}
