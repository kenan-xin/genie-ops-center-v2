export type SupportContact = {
  readonly label: string;
  readonly href: string;
};

// One `@`, no space, and none of `? & # % / :`, which would add mailto headers or a path.
const EMAIL = /^[^\s@?&#%/:]+@[^\s@?&#%/:]+$/;

/** The one support email rule: the link builder and the branding write path both use it. */
export function isSupportEmail(value: string): boolean {
  return EMAIL.test(value);
}

/**
 * The one support link branding offers: a valid email wins, else an http(s) page, else none. Both
 * values are trimmed, so a blank or a `javascript:` value never becomes a link.
 */
export function supportContact(values: {
  readonly supportEmail: string | null;
  readonly supportUrl: string | null;
}): SupportContact | null {
  const email = values.supportEmail?.trim() ?? "";

  if (isSupportEmail(email)) {
    return { label: email, href: `mailto:${email}` };
  }

  const url = values.supportUrl?.trim() ?? "";

  if (URL.canParse(url) && /^https?:$/.test(new URL(url).protocol)) {
    return { label: url, href: url };
  }

  return null;
}
