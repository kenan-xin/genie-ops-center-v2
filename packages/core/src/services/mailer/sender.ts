/** One sender: the address on `MAIL_FROM` and the branding display name, which may be empty. */
export type MailSenderAddress = {
  readonly name: string;
  readonly address: string;
};

/** One rendered message handed to an adapter. Both parts are required, so neither is derived. */
export type OutgoingMail = {
  readonly from: MailSenderAddress;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

/** One adapter's send: it either resolves after the provider accepted the message, or rejects. */
export type MailSender = (mail: OutgoingMail) => Promise<void>;

/** The characters RFC 5322 treats as specials, so a display name holding one must be quoted. */
const SPECIALS = /[()<>[\]:;@\\,."]/;

/**
 * The `from` value for a header built as a string, which is what Resend takes. A display name is
 * quoted only when RFC 5322 requires it, so `Acme Security` stays bare and `Acme, Inc` becomes
 * `"Acme, Inc"`; a comma or an address-like name is therefore part of the name, never a second
 * From address. CR and LF are removed so branding cannot inject a header (R-43).
 */
export function formatSenderAddress(sender: MailSenderAddress): string {
  const name = sender.name.replace(/[\r\n]+/g, " ").trim();

  if (name === "") return sender.address;

  const display = SPECIALS.test(name)
    ? `"${name.replace(/(["\\])/g, "\\$1")}"`
    : name;

  return `${display} <${sender.address}>`;
}

/**
 * The `from` value for Nodemailer, which encodes an address itself. Passing the structured pair
 * lets Nodemailer quote a special name the same way it quotes a recipient's, so one name yields
 * exactly one From. An empty display name is passed as the bare address.
 */
export function nodemailerSender(
  sender: MailSenderAddress
): string | { readonly name: string; readonly address: string } {
  const name = sender.name.replace(/[\r\n]+/g, " ").trim();

  return name === "" ? sender.address : { name, address: sender.address };
}
