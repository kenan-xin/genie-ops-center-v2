import { createServer } from "node:net";
import type { AddressInfo, Server, Socket } from "node:net";

/**
 * A local SMTP server that speaks just enough of the protocol for Nodemailer to deliver one
 * message, and records what it received. `dataFailureReply` answers the DATA command with a
 * failure line, so a test can see what the mailer does with a provider's rejection text.
 */
export async function startSmtpSink(
  options: { readonly dataFailureReply?: string } = {}
): Promise<{
  readonly server: Server;
  readonly url: string;
  readonly messages: string[];
  readonly recipients: string[];
}> {
  const messages: string[] = [];
  const recipients: string[] = [];

  const server = createServer((socket: Socket) => {
    let buffered = "";
    let message = "";
    let readingMessage = false;
    socket.write("220 local.test ESMTP\r\n");

    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");

      while (buffered.includes("\r\n")) {
        const end = buffered.indexOf("\r\n");
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);

        if (readingMessage) {
          if (line === ".") {
            messages.push(message);
            message = "";
            readingMessage = false;
            socket.write("250 queued\r\n");
          } else {
            message += `${line}\r\n`;
          }
        } else if (/^EHLO\b|^HELO\b/i.test(line)) {
          socket.write("250-local.test\r\n250 PIPELINING\r\n");
        } else if (/^DATA\b/i.test(line)) {
          if (options.dataFailureReply === undefined) {
            readingMessage = true;
            socket.write("354 end with dot\r\n");
          } else {
            socket.write(`${options.dataFailureReply}\r\n`);
          }
        } else if (/^RCPT TO:/i.test(line)) {
          recipients.push(line);
          socket.write("250 recipient ok\r\n");
        } else if (/^QUIT\b/i.test(line)) {
          socket.write("221 bye\r\n");
        } else {
          socket.write("250 ok\r\n");
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  // SAFETY: this server listens on an explicit TCP host and ephemeral port.
  const address: AddressInfo = server.address() as AddressInfo;

  return {
    server,
    url: `smtp://127.0.0.1:${address.port}`,
    messages,
    recipients,
  };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}
