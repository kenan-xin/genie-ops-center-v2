/**
 * The R-48 template catalogue: the fixed ids and the shapes the renderer and the mailer share.
 * It holds no JSX, so the core package root and the plain-Node release entry can import the
 * catalogue without loading a `.tsx` module.
 */

export const MAIL_TEMPLATE_IDS = [
  "invitation-brokered",
  "invitation-local-account",
  "role-granted",
  "role-removed",
  "new-device-sign-in",
  "module-notification",
] as const;

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

/** The values one template reads. A missing value renders empty text, never the word `undefined`. */
export type MailTemplateVariables = Readonly<Record<string, string>>;

/** One rendered message: a subject, an HTML part and a plain-text part written separately. */
export type RenderedMail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};
