import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { RealmSmtp } from "./representation.ts";

/** The named cause when the realm SMTP values are missing (R-53, R-58a). */
export const REALM_SMTP_REFUSAL =
  "the local-accounts realm needs MAIL_PROVIDER=smtp with MAIL_FROM and SMTP_URL, because Keycloak sends its own set-password, reset-password and verify-email messages; set them in .env";

/**
 * The SMTP values the local variant carries (R-53, R-58a, DEC-40): the connection and `from` come
 * from the mail configuration, and the sender name and reply-to come from branding. Nothing when
 * the mail configuration is not SMTP.
 */
export function realmSmtp(
  env: Pick<TenantContext["env"], "mailProvider" | "smtpUrl" | "mailFrom">,
  sender: {
    readonly name: string | null | undefined;
    readonly replyTo: string | null | undefined;
  }
): RealmSmtp | undefined {
  if (
    env.mailProvider !== "smtp" ||
    env.smtpUrl === undefined ||
    env.mailFrom === undefined
  ) {
    return undefined;
  }

  return {
    ...parseSmtpUrl(env.smtpUrl),
    from: env.mailFrom,
    fromDisplayName: sender.name ?? undefined,
    replyTo: sender.replyTo ?? undefined,
    replyToDisplayName: sender.name ?? undefined,
  };
}

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
