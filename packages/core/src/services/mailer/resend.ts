import { Resend } from "resend";

import type { MailSender } from "./sender.ts";

/**
 * The hosted-provider adapter of R-43, over the Resend SDK. The SDK resolves rather than rejects
 * when the provider refuses a message, so this adapter reads the returned error and throws it,
 * which is what lets a caller fail before it treats the send as done. The SDK's own error text is
 * generic, so a tokenized link in the message body never reaches it (R-49).
 */
export function createResendSender(apiKey: string): MailSender {
  const resend = new Resend(apiKey);

  return async (mail) => {
    const { error } = await resend.emails.send({
      from: mail.from,
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
