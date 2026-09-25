/** One rendered message handed to an adapter. Both parts are required, so neither is derived. */
export type OutgoingMail = {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

/** One adapter's send: it either resolves after the provider accepted the message, or rejects. */
export type MailSender = (mail: OutgoingMail) => Promise<void>;
