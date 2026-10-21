/**
 * The SMTP connection the local-accounts realm carries (R-53, DEC-40). The parsed shape is the
 * connection half of `RealmSmtp`; the realm step adds the sender values from the branding seed.
 */
export type SmtpConnection = {
  readonly host: string;
  readonly port: string;
  readonly username: string;
  readonly password: string;
  readonly ssl: boolean;
  readonly starttls: boolean;
};

/**
 * Parses an `SMTP_URL` into the realm's SMTP connection settings (R-53). The scheme picks the
 * transport: `smtps:` is implicit TLS (`ssl`), and a plain `smtp:` URL upgrades with STARTTLS. The
 * user and password are percent-decoded, because `URL` keeps them encoded and Keycloak needs the
 * literal value a password with `/`, `+`, `@` or `%` carries.
 */
export function parseSmtpUrl(smtpUrl: string): SmtpConnection {
  const url = new URL(smtpUrl);
  const secure = url.protocol === "smtps:";

  return {
    host: url.hostname,
    port: url.port !== "" ? url.port : secure ? "465" : "587",
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: secure,
    starttls: !secure,
  };
}
