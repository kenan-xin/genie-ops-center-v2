import { execFile } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { scopedPort, scopedProject } from "./worktree-scope.ts";

const run = promisify(execFile);

/**
 * The identity stand-ins of tech plan D2-2: one test Keycloak that imports the
 * `company` realm (an OpenID Connect and SAML 2.0 identity provider with seeded
 * users and groups), an OpenLDAP directory with the memberOf overlay, and
 * Mailpit. They are test-only and never reach a customer stack; the compose file
 * lives beside the other test stacks in `deploy/stack/`.
 */
const COMPOSE_FILE = resolve(
  import.meta.dirname,
  "../../../deploy/stack/compose.identity-standins.yaml"
);

/**
 * The first port of Linux's ephemeral range. A fixed host port at or above it
 * can be taken by a container Docker starts with an automatic port, so the
 * check mirrors `image-ports.ts` for the ports this stack publishes.
 */
const EPHEMERAL_PORT_MIN = 32768;

function standinPort(base: number): number {
  const port = scopedPort(base);

  if (port >= EPHEMERAL_PORT_MIN) {
    throw new Error(
      `Identity stand-in port ${port} (base ${base}) is inside the ephemeral range from ${EPHEMERAL_PORT_MIN}, where Docker assigns automatic ports.`
    );
  }

  return port;
}

export type IdentityStandins = {
  readonly keycloakUrl: string;
  readonly mailpitUrl: string;
  readonly smtpPort: number;
  readonly stop: () => Promise<void>;
  /** Runs a simple-bind search inside the OpenLDAP container and returns its exit and output. */
  readonly ldapSearch: (filter: string) => Promise<{
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
};

export async function startIdentityStandins(): Promise<IdentityStandins> {
  const projectName = scopedProject("genie-identity-standins");
  const keycloakPort = standinPort(15080);
  const ldapPort = standinPort(15389);
  const smtpPort = standinPort(15025);
  const mailpitPort = standinPort(18025);

  const compose = (args: readonly string[]) =>
    run("docker", ["compose", "-p", projectName, "-f", COMPOSE_FILE, ...args], {
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        GENIE_STANDIN_KEYCLOAK_PORT: String(keycloakPort),
        GENIE_STANDIN_LDAP_PORT: String(ldapPort),
        GENIE_STANDIN_SMTP_PORT: String(smtpPort),
        GENIE_STANDIN_MAILPIT_PORT: String(mailpitPort),
      },
    });

  const stop = async () => {
    await compose(["down", "--volumes", "--remove-orphans"]).catch(
      () => undefined
    );
  };

  const ldapSearch = async (filter: string) => {
    try {
      const { stdout, stderr } = await compose([
        "exec",
        "--no-TTY",
        "openldap",
        "ldapsearch",
        "-H",
        "ldap://127.0.0.1:10389",
        "-x",
        "-b",
        "dc=planetexpress,dc=com",
        "-D",
        "cn=admin,dc=planetexpress,dc=com",
        "-w",
        "GoodNewsEveryone",
        filter,
        "dn",
      ]);

      return { code: 0, stdout, stderr };
    } catch (error) {
      // SAFETY: execFile rejects with the captured streams on a nonzero exit.
      const failure = error as {
        readonly stdout?: string | Buffer;
        readonly stderr?: string | Buffer;
      };

      return {
        code: 1,
        stdout: String(failure.stdout ?? ""),
        stderr: String(failure.stderr ?? ""),
      };
    }
  };

  try {
    // `--wait` returns once the services with a health check are healthy, so the
    // test never races Keycloak's realm import or the directory's bootstrap.
    await compose(["up", "-d", "--wait"]);
  } catch (error) {
    await stop();

    throw error;
  }

  return {
    keycloakUrl: `http://127.0.0.1:${keycloakPort}`,
    mailpitUrl: `http://127.0.0.1:${mailpitPort}`,
    smtpPort,
    stop,
    ldapSearch,
  };
}

/**
 * One pending SMTP response reader. A response ends on a line whose fourth
 * character is a space (`250 ok`), and a multi-line response's earlier lines
 * (`250-...`) are skipped, which is the whole of RFC 5321 that this client needs.
 */
class SmtpConversation {
  private buffer = "";
  private readonly waiters: ((line: string) => void)[] = [];

  constructor(socket: ReturnType<typeof createConnection>) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
  }

  private drain(): void {
    let end = this.buffer.indexOf("\r\n");

    while (end !== -1) {
      const line = this.buffer.slice(0, end);

      this.buffer = this.buffer.slice(end + 2);

      if (/^\d{3} /.test(line)) {
        this.waiters.shift()?.(line);
      }

      end = this.buffer.indexOf("\r\n");
    }
  }

  expect(): Promise<string> {
    return new Promise((settle) => {
      this.waiters.push(settle);
    });
  }
}

/**
 * Delivers one plain-text message to Mailpit over real SMTP, the same path
 * Keycloak's realm mail uses, so the smoke test proves the mail sink the
 * Section 2 scenarios read, not only its HTTP API.
 */
export async function sendSmtpMail(input: {
  readonly host: string;
  readonly port: number;
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}): Promise<void> {
  const socket = createConnection({ host: input.host, port: input.port });

  const smtp = new SmtpConversation(socket);

  const command = async (text: string): Promise<string> => {
    socket.write(`${text}\r\n`);

    return smtp.expect();
  };

  try {
    await new Promise<void>((settle, fail) => {
      socket.once("connect", () => settle());
      socket.once("error", fail);
    });

    await smtp.expect();

    const ehlo = await command("EHLO standin.test");

    if (!ehlo.startsWith("250")) {
      throw new Error(`SMTP EHLO was refused: ${ehlo}`);
    }

    const sender = await command(`MAIL FROM:<${input.from}>`);

    if (!sender.startsWith("250")) {
      throw new Error(`SMTP MAIL FROM was refused: ${sender}`);
    }

    const recipient = await command(`RCPT TO:<${input.to}>`);

    if (!recipient.startsWith("250")) {
      throw new Error(`SMTP RCPT TO was refused: ${recipient}`);
    }

    const data = await command("DATA");

    if (!data.startsWith("354")) {
      throw new Error(`SMTP DATA was refused: ${data}`);
    }

    socket.write(
      [
        `From: ${input.from}`,
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        input.body,
        ".",
        "",
      ].join("\r\n")
    );

    const accepted = await smtp.expect();

    if (!accepted.startsWith("250")) {
      throw new Error(`SMTP message was rejected: ${accepted}`);
    }

    await command("QUIT");
  } finally {
    socket.end();
  }
}
