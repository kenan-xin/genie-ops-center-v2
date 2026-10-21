import { createTransport } from "nodemailer";

import { nodemailerSender, type MailSender } from "./sender.ts";

/**
 * The SMTP adapter of R-43, over Nodemailer. Nodemailer accepts the `SMTP_URL` form of the
 * environment contract directly, and `sendMail` with both an `html` and a `text` part builds the
 * `multipart/alternative` message an ordinary mail client reads (R-44). The sender is passed as a
 * `{ name, address }` pair, so Nodemailer quotes a display name that holds a comma or an address
 * and the header carries exactly one From.
 */
export function createSmtpSender(smtpUrl: string): MailSender {
  const transport = createTransport(smtpUrl);

  return async (mail) => {
    await transport.sendMail({
      from: nodemailerSender(mail.from),
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  };
}
