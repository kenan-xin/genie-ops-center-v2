import { z } from "zod";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { RedactingLogger } from "../logging/index.ts";
import type { MailTemplateId } from "./catalogue.ts";
import { createResendSender } from "./resend.ts";
import type { MailSender, MailSenderAddress } from "./sender.ts";
import { createSmtpSender } from "./smtp.ts";

export type {
  MailTemplateId,
  MailTemplateVariables,
  RenderedMail,
} from "./catalogue.ts";

export type { MailSender, MailSenderAddress, OutgoingMail } from "./sender.ts";

/** The provider `MAIL_PROVIDER` selects. `none` is the unset value and builds no adapter (R-45). */
export type MailProvider = "none" | "resend" | "smtp";

/** The runtime mode the mailer gates its development-only behaviour on (R-45, R-49). */
export type MailRuntimeMode = "development" | "production";

/** The validated mail and mode values the mailer is built from once, at context construction (D-7). */
export type MailerEnvironment = {
  readonly mailProvider: MailProvider;
  readonly mailFrom: string | undefined;
  readonly resendApiKey: string | undefined;
  readonly smtpUrl: string | undefined;
  readonly runtimeMode: MailRuntimeMode;
  /** The tenant id the development line carries, like every other line (R-75). */
  readonly publicUrl?: string;
};

/** One send: a catalogue template, its recipient, and the values the template reads (R-48). */
export type MailSendInput = {
  readonly templateId: MailTemplateId;
  readonly to: string;
  readonly variables: Readonly<Record<string, string>>;
};

/**
 * The mailer of R-43. `provider` is fixed at construction, so a caller can decide what an action
 * must do when no mailer is configured. `requireConfigured()` is the fail-before-write gate of
 * R-45: a real action calls it before it creates a row, and `send()` calls the same rule itself.
 */
export type Mailer = {
  readonly provider: MailProvider;
  readonly requireConfigured: () => void;
  readonly send: (input: MailSendInput) => Promise<void>;
};

/** The branding values a mailer reads: the sender display name and the fallback company name. */
export type MailBranding = {
  readonly companyName: string;
  readonly emailSenderName: string | null;
};

export type MailerDependencies = {
  readonly branding: { readonly get: () => Promise<MailBranding> };
  readonly logger: Pick<RedactingLogger, "info" | "error">;
  /** Resolves a link variable given as a path against `PUBLIC_URL` (R-70). */
  readonly publicUrl?: (path: string) => string;
};

/** The template variables that hold the email's one link (templates.tsx). */
const LINK_VARIABLES = ["link", "invitationUrl"] as const;

/** The safe catalogue error a link on another origin is refused with (R-70). */
const MAIL_LINK_ORIGIN = CORE_ERRORS["mail-link-origin"];

/**
 * One link value parsed against a base address, or `undefined` when the URL parser refuses it.
 * `new URL` also resolves a protocol-relative `//host` and a backslash reference `/\host` to the
 * host they name, so both are compared like any other link rather than treated as a path (R-70).
 */
function parseLink(value: string, base: string): URL | undefined {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

/**
 * One action link resolved against `PUBLIC_URL` (R-70). A path (`/invite?token=...`) becomes an
 * absolute link from `PUBLIC_URL`, so a caller never needs, and never reads, a request host to
 * build one. An absolute link is kept only when its origin is `PUBLIC_URL`'s; every other value
 * — another host, scheme or port, a protocol-relative or backslash reference, a `javascript:` or
 * `mailto:` link — is refused before a template renders or an adapter runs. A link carries a
 * token, so the refusal is the fixed catalogue message and never echoes the value (R-49).
 */
function resolveActionLink(
  value: string,
  publicUrl: NonNullable<MailerDependencies["publicUrl"]>,
  origin: string
): string {
  const parsed = parseLink(value, origin);

  if (parsed === undefined || parsed.origin !== origin) {
    throw new AppError(MAIL_LINK_ORIGIN);
  }

  // An absolute link the caller wrote on the public origin is kept as written.
  if (URL.canParse(value)) return value;

  // A path is rebuilt from PUBLIC_URL, so a configured path prefix is kept.
  return `${publicUrl(parsed.pathname)}${parsed.search}${parsed.hash}`;
}

/**
 * The links of R-70. Every action link variable is checked against `PUBLIC_URL` before the send
 * continues: a path is resolved, an absolute same-origin link passes unchanged, and any other
 * value is refused here, before a template renders or an adapter runs (R-70). A variable that is
 * not an action link, and an action link left empty, is left as the caller wrote it.
 */
function withPublicLinks(
  input: MailSendInput,
  publicUrl: MailerDependencies["publicUrl"]
): MailSendInput {
  if (publicUrl === undefined) return input;

  const variables = { ...input.variables };
  const origin = new URL(publicUrl("/")).origin;

  for (const name of LINK_VARIABLES) {
    const value = variables[name];

    if (value === undefined || value.trim() === "") continue;

    variables[name] = resolveActionLink(value, publicUrl, origin);
  }

  return { ...input, variables };
}

const MAIL_NOT_CONFIGURED = CORE_ERRORS["mail-not-configured"];

const INVALID_INPUT = CORE_ERRORS["invalid-input"];

/** The safe catalogue error a failed delivery logs and throws. It carries no adapter text. */
const MAIL_DELIVERY_FAILED = CORE_ERRORS["mail-delivery-failed"];

/**
 * An adapter's failure as far as the log is concerned: an error, and the numeric provider status a
 * Nodemailer or Resend error may carry. Both fields are optional, so any error is one of these.
 */
type AdapterFailure = Error & {
  readonly responseCode?: number;
  readonly statusCode?: number;
};

/** The fail-before-write rule of R-45, shared by `requireConfigured` and `send`. */
function refuseWhenUnconfigured(env: MailerEnvironment): void {
  if (env.mailProvider !== "none") return;

  if (env.runtimeMode !== "development")
    throw new AppError(MAIL_NOT_CONFIGURED);
}

/** A recipient is exactly one address. A comma-joined list would fan out to several people (F7). */
function assertRecipient(to: string): void {
  if (!z.email().safeParse(to).success) throw new AppError(INVALID_INPUT);
}

/** One provider status, read from whichever name the adapter's error carries it under. */
function providerStatusOf(error: AdapterFailure): number | undefined {
  const status = error.responseCode ?? error.statusCode;

  return status === undefined || !Number.isInteger(status) ? undefined : status;
}

/**
 * What a failed delivery logs: a stable code, the adapter and the provider's numeric status, plus
 * the recipient and template id. R-49: never the error's message or response, which can echo the
 * message body, including a path-segment token the redactor cannot see. The caller gets the safe
 * catalogue error instead, with no cause, so the adapter's own text never leaves this function and
 * cannot reach a worker log or a job row (R2).
 */
function deliveryFailureFields(
  error: AdapterFailure,
  input: MailSendInput,
  adapter: MailProvider
) {
  const fields = {
    code: MAIL_DELIVERY_FAILED.code,
    adapter,
    to: input.to,
    templateId: input.templateId,
  };

  const status = providerStatusOf(error);

  return status === undefined ? fields : { ...fields, responseCode: status };
}

function firstNonEmpty(...values: readonly (string | null)[]): string {
  return (
    values.find((entry) => entry !== null && entry.trim() !== "")?.trim() ?? ""
  );
}

/**
 * The `from` header: `MAIL_FROM` with the branding sender name, falling back to the company name
 * when the seed omitted one (branding-seed.md), and to the bare address when both are empty. The
 * adapters do the RFC 5322 quoting, so a name with a comma stays one From.
 */
function senderFor(branding: MailBranding, address: string): MailSenderAddress {
  return {
    name: firstNonEmpty(branding.emailSenderName, branding.companyName),
    address,
  };
}

function requireApiKey(env: MailerEnvironment): string {
  if (env.resendApiKey === undefined) {
    throw new Error("RESEND_API_KEY is required when MAIL_PROVIDER=resend");
  }

  return env.resendApiKey;
}

function requireSmtpUrl(env: MailerEnvironment): string {
  if (env.smtpUrl === undefined) {
    throw new Error("SMTP_URL is required when MAIL_PROVIDER=smtp");
  }

  return env.smtpUrl;
}

/**
 * R-45 and the owner decision on F5: with no provider, development logs the generated message and
 * its full working link so a developer can follow it, while production refuses before this line
 * (R-45) and no production log ever carries a link (R-49). The redacting logger cannot carry the
 * unredacted link by design, so this one development-only message is written straight to stdout.
 * Section 2 link builders put the token in a query parameter, which this exception does not change.
 */
function writeDevelopmentMessage(
  input: MailSendInput,
  tenantId: string | undefined
): void {
  process.stdout.write(
    `${JSON.stringify({
      level: "info",
      tenantId,
      msg: "mail generated with no provider, nothing was sent",
      to: input.to,
      templateId: input.templateId,
      variables: input.variables,
    })}\n`
  );
}

/** One configured send, over the adapter built once at context construction. */
function configuredSend(
  env: MailerEnvironment,
  deps: MailerDependencies
): (input: MailSendInput) => Promise<void> {
  const address = env.mailFrom;

  if (address === undefined) {
    throw new Error("MAIL_FROM is required when MAIL_PROVIDER is set");
  }

  const sender: MailSender =
    env.mailProvider === "resend"
      ? createResendSender(requireApiKey(env))
      : createSmtpSender(requireSmtpUrl(env));

  return async (input) => {
    const branding = await deps.branding.get();

    // The React Email templates are TSX, so they load here rather than while a context is built:
    // the build-safety probe and the release entry run under Node's native type stripping, which
    // cannot load a `.tsx` module (R-19). A test that captures image output still awaits this send.
    const { renderMailTemplate } = await import("./templates.tsx");

    const rendered = await renderMailTemplate(
      input.templateId,
      input.variables
    );

    try {
      await sender({
        from: senderFor(branding, address),
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } catch (caught) {
      const failure = caught instanceof Error ? caught : new Error("delivery");

      deps.logger.error(
        deliveryFailureFields(failure, input, env.mailProvider),
        "mail delivery failed"
      );

      // R2: a safe catalogue error with no cause, so the adapter's text cannot travel onward.
      throw new AppError(MAIL_DELIVERY_FAILED);
    }
  };
}

/**
 * Builds one mailer from the validated environment. It is a fixed context member built once, like
 * the file store (D-7), so a later change to the environment source cannot move its provider.
 *
 * With `MAIL_PROVIDER` unset the mailer is `none`: production refuses before a caller writes a row
 * (R-45) and development logs the message and its working link instead. The mode is the validated
 * `runtimeMode`, so the development exception turns off for any value that is not `development`.
 */
export function createMailer(
  env: MailerEnvironment,
  deps: MailerDependencies
): Mailer {
  const { mailProvider } = env;

  // The adapter is built once here, not on every send, so a context's mailer holds one transport.
  const sendConfigured =
    mailProvider === "none" ? undefined : configuredSend(env, deps);

  return {
    provider: mailProvider,
    requireConfigured() {
      refuseWhenUnconfigured(env);
    },
    async send(given) {
      const input = withPublicLinks(given, deps.publicUrl);

      assertRecipient(input.to);

      if (sendConfigured === undefined) {
        refuseWhenUnconfigured(env);

        writeDevelopmentMessage(input, env.publicUrl);

        return;
      }

      await sendConfigured(input);
    },
  };
}
