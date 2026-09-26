import { Resend } from "resend";

import { formatSenderAddress, type MailSender } from "./sender.ts";

/**
 * The hosted-provider adapter of R-43, over the Resend SDK. The `from` value is built here as an
 * RFC 5322 string, because the SDK takes one. The SDK resolves rather than rejects when the
 * provider refuses a message, so this adapter reads the returned error and throws it, which lets a
 * caller fail before it treats the send as done.
 *
 * R-49 note: the SDK catches an unreachable `fetch` and returns a fixed message, so the body never
 * reaches here by that path. Outside production the SDK also writes the provider's error JSON to
 * `console.error` through its own `logError`, bypassing the redacting logger; `NODE_ENV=production`
 * suppresses that write, and the JSON normally holds no link. Nothing else here logs the message.
 */
export function createResendSender(apiKey: string): MailSender {
  const resend = new Resend(apiKey);

  return async (mail) => {
    const { error } = await resend.emails.send({
      from: formatSenderAddress(mail.from),
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    if (error !== null) {
      throw new Error(`Resend did not accept the message: ${error.message}`);
    }
  };
}
