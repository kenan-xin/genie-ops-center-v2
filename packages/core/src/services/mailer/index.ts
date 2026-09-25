import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { RedactingLogger } from "../logging/index.ts";
import { createResendSender } from "./resend.ts";
import type { MailSender } from "./sender.ts";
import { createSmtpSender } from "./smtp.ts";
import { renderMailTemplate, type MailTemplateId } from "./templates.ts";

export { MAIL_TEMPLATE_IDS, renderMailTemplate } from "./templates.ts";

export type {
  MailTemplateId,
  MailTemplateVariables,
  RenderedMail,
} from "./templates.ts";

export type { MailSender, OutgoingMail } from "./sender.ts";

/** The provider `MAIL_PROVIDER` selects. `none` is the unset value and builds no adapter (R-45). */
export type MailProvider = "none" | "resend" | "smtp";

/** The validated mail values the mailer is built from once, at context construction (D-7). */
export type MailerEnvironment = {
  readonly mailProvider: MailProvider;
  readonly mailFrom: string | undefined;
  readonly resendApiKey: string | undefined;
  readonly smtpUrl: string | undefined;
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
};

const MAIL_NOT_CONFIGURED = CORE_ERRORS["mail-not-configured"];

/** The image's runtime mode. Only production refuses an unconfigured send (R-45). */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The fail-before-write rule of R-45, shared by `requireConfigured` and `send`. */
function refuseWhenUnconfigured(provider: MailProvider): void {
  if (provider !== "none") return;

  if (isProduction()) throw new AppError(MAIL_NOT_CONFIGURED);
}

function firstNonEmpty(...values: readonly (string | null)[]): string {
  return (
    values.find((entry) => entry !== null && entry.trim() !== "")?.trim() ?? ""
  );
}

/**
 * The `from` header: `MAIL_FROM` with the branding sender name, falling back to the company name
 * when the seed omitted one (branding-seed.md), and to the bare address when both are empty.
 */
function senderFor(branding: MailBranding, address: string): string {
  const name = firstNonEmpty(branding.emailSenderName, branding.companyName);

  return name === "" ? address : `${name} <${address}>`;
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
 * One configured send. An unconfigured deployment logs the generated message through the redacting
 * logger in development, which is where R-45 puts the link, and refuses in production.
 */
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
    const rendered = renderMailTemplate(input.templateId, input.variables);

    try {
      await sender({
        from: senderFor(branding, address),
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } catch (error) {
      // R-49: the failure is logged through the redacting logger, so a tokenized link in the
      // message or in the provider's reply cannot reach a log line.
      deps.logger.error(
        { err: error, to: input.to, templateId: input.templateId },
        "mail delivery failed"
      );

      throw error;
    }
  };
}

/**
 * Builds one mailer from the validated environment. It is a fixed context member built once, like
 * the file store (D-7), so a later change to the environment source cannot move its provider.
 *
 * With `MAIL_PROVIDER` unset the mailer is `none`: production refuses before a caller writes a row
 * (R-45) and development logs the message instead, while the redacting logger keeps a tokenized
 * link out of every line (R-49).
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
      refuseWhenUnconfigured(mailProvider);
    },
    async send(input) {
      if (sendConfigured === undefined) {
        refuseWhenUnconfigured(mailProvider);

        deps.logger.info(
          {
            to: input.to,
            templateId: input.templateId,
            variables: input.variables,
          },
          "mail generated with no provider, nothing was sent"
        );

        return;
      }

      await sendConfigured(input);
    },
  };
}
