import { createTransport } from "nodemailer";

import type { MailSender } from "./sender.ts";

/**
 * The SMTP adapter of R-43, over Nodemailer. Nodemailer accepts the `SMTP_URL` form of the
 * environment contract directly, and `sendMail` with both an `html` and a `text` part builds the
 * `multipart/alternative` message an ordinary mail client reads (R-44).
 */
export function createSmtpSender(smtpUrl: string): MailSender {
  const transport = createTransport(smtpUrl);

  return async (mail) => {
    await transport.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  };
}
