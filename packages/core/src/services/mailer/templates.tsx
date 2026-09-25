/**
 * The R-48 template catalogue: invitation with a brokered and a local-account variant, role
 * granted, role removed, new-device sign-in and module notification. The templates and the mailer
 * land with this ticket; the events that send them land in Section 2 item 8 and the first module
 * that notifies.
 *
 * The HTML part is rendered from React Email components (`DEC-11`, tech-stack "Email templates").
 * The plain-text part is a hand-written builder per template and is never produced from the HTML
 * with React Email's `plainText` option, so neither part is derived from the other (R-44). A
 * tokenized link lives in the template variables, so the renderer never writes a link to its own
 * output; only the mailer logs, and it logs through the redacting logger (R-49).
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
  render,
} from "@react-email/components";

import type {
  MailTemplateId,
  MailTemplateVariables,
  RenderedMail,
} from "./catalogue.ts";

export { MAIL_TEMPLATE_IDS } from "./catalogue.ts";

export type {
  MailTemplateId,
  MailTemplateVariables,
  RenderedMail,
} from "./catalogue.ts";

/** The one link a template offers, as a button in HTML and a labelled url in plain text. */
type MailAction = {
  readonly label: string;
  readonly url: string;
};

type MailContent = {
  readonly subject: string;
  readonly heading: string;
  readonly preview: string;
  readonly paragraphs: readonly string[];
  readonly action: MailAction;
  readonly footer: string;
};

/** One variable, or the empty string. A caller that omits a value gets no `undefined` in a body. */
function value(variables: MailTemplateVariables, key: string): string {
  return variables[key] ?? "";
}

/** The first non-empty value, so a template falls back to the other link it was given. */
function firstNonEmpty(...values: readonly string[]): string {
  return values.find((entry) => entry !== "") ?? "";
}

function greeting(variables: MailTemplateVariables): string {
  return `Hello ${value(variables, "name")},`;
}

function invitationBrokered(variables: MailTemplateVariables): MailContent {
  const productName = value(variables, "productName");

  return {
    subject: `You are invited to ${productName}`,
    heading: "You are invited",
    preview: `${value(variables, "inviterName")} invited you to ${productName}.`,
    paragraphs: [
      greeting(variables),
      `${value(variables, "inviterName")} invited you to join ${value(variables, "companyName")} on ${productName}.`,
      "Accept the invitation to finish setting up your account.",
    ],
    action: {
      label: "Accept invitation",
      url: firstNonEmpty(
        value(variables, "invitationUrl"),
        value(variables, "link")
      ),
    },
    footer: `You received this email because an administrator invited ${value(variables, "email")}.`,
  };
}

/**
 * The local-account variant of DEC-10 and DEC-40: it is a notice that the person was added and
 * that the realm will send the set-password email, never the credential email itself.
 */
function invitationLocalAccount(variables: MailTemplateVariables): MailContent {
  const companyName = value(variables, "companyName");
  const productName = value(variables, "productName");

  return {
    subject: `Your ${productName} account is ready`,
    heading: "Your account has been created",
    preview: `An account was created for you at ${companyName}.`,
    paragraphs: [
      greeting(variables),
      `An account was created for you at ${companyName}.`,
      `${companyName} will send you a separate email with a link to set your password.`,
    ],
    action: {
      label: `Open ${productName}`,
      url: firstNonEmpty(
        value(variables, "link"),
        value(variables, "invitationUrl")
      ),
    },
    footer: `Do not share this message. ${companyName} never asks you for your password.`,
  };
}

function roleGranted(variables: MailTemplateVariables): MailContent {
  const companyName = value(variables, "companyName");
  const roleName = value(variables, "roleName");

  return {
    subject: `You were granted the ${roleName} role`,
    heading: "Role granted",
    preview: `You now have the ${roleName} role at ${companyName}.`,
    paragraphs: [
      greeting(variables),
      `You now have the ${roleName} role at ${companyName}.`,
    ],
    action: {
      label: `Open ${value(variables, "productName")}`,
      url: value(variables, "link"),
    },
    footer: `If you did not expect this change, contact ${value(variables, "supportEmail")}.`,
  };
}

function roleRemoved(variables: MailTemplateVariables): MailContent {
  const companyName = value(variables, "companyName");
  const roleName = value(variables, "roleName");

  return {
    subject: `Your ${roleName} role was removed`,
    heading: "Role removed",
    preview: `The ${roleName} role was removed from your account.`,
    paragraphs: [
      greeting(variables),
      `The ${roleName} role at ${companyName} was removed from your account.`,
      `If you believe this is a mistake, contact ${value(variables, "supportEmail")}.`,
    ],
    action: {
      label: `Open ${value(variables, "productName")}`,
      url: value(variables, "link"),
    },
    footer: `You received this email because your role at ${companyName} changed.`,
  };
}

function newDeviceSignIn(variables: MailTemplateVariables): MailContent {
  const productName = value(variables, "productName");

  return {
    subject: `New sign-in to ${productName}`,
    heading: "New device sign-in",
    preview: `Your account signed in from ${value(variables, "deviceName")}.`,
    paragraphs: [
      greeting(variables),
      `Your account signed in from ${value(variables, "deviceName")}.`,
      `If this was not you, contact ${value(variables, "supportEmail")}.`,
    ],
    action: {
      label: "Review your account",
      url: value(variables, "link"),
    },
    footer: `You received this email because ${productName} saw a sign-in from a new device.`,
  };
}

function moduleNotification(variables: MailTemplateVariables): MailContent {
  const moduleName = value(variables, "moduleName");

  return {
    subject: `${moduleName} has an update`,
    heading: `${moduleName} notification`,
    preview: firstNonEmpty(
      value(variables, "message"),
      `${moduleName} has an update for you.`
    ),
    paragraphs: [
      greeting(variables),
      firstNonEmpty(
        value(variables, "message"),
        `${moduleName} has an update for you.`
      ),
    ],
    action: { label: `Open ${moduleName}`, url: value(variables, "link") },
    footer: `You received this email because ${value(variables, "companyName")} enabled ${moduleName}.`,
  };
}

/** One content builder per catalogue id, so a new id is a compile error until it has a builder. */
const BUILDERS: Readonly<
  Record<MailTemplateId, (variables: MailTemplateVariables) => MailContent>
> = {
  "invitation-brokered": invitationBrokered,
  "invitation-local-account": invitationLocalAccount,
  "role-granted": roleGranted,
  "role-removed": roleRemoved,
  "new-device-sign-in": newDeviceSignIn,
  "module-notification": moduleNotification,
};

const STYLES = {
  body: { backgroundColor: "#f4f5f7", fontFamily: "sans-serif" },
  container: {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    maxWidth: "560px",
    padding: "32px",
  },
  heading: { color: "#111827", fontSize: "22px" },
  paragraph: { color: "#374151", fontSize: "15px", lineHeight: "24px" },
  button: { color: "#1d4ed8", fontSize: "15px" },
  rule: { borderColor: "#e5e7eb" },
  footer: { color: "#6b7280", fontSize: "12px" },
};

/** The one branded layout every catalogue template renders through. */
function MailLayout({ content }: { readonly content: MailContent }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{content.preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Heading style={STYLES.heading}>{content.heading}</Heading>
          {content.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={STYLES.paragraph}>
              {paragraph}
            </Text>
          ))}
          <Link href={content.action.url} style={STYLES.button}>
            {content.action.label}
          </Link>
          <Hr style={STYLES.rule} />
          <Text style={STYLES.footer}>{content.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

/** The plain-text part, written here and never derived from the rendered HTML (R-44). */
function renderText(content: MailContent): string {
  return [
    content.heading,
    "",
    ...content.paragraphs,
    "",
    `${content.action.label}: ${content.action.url}`,
    "",
    content.footer,
  ].join("\n");
}

/** Renders one catalogue template to its subject, its HTML part and its plain-text part (R-44). */
export async function renderMailTemplate(
  id: MailTemplateId,
  variables: MailTemplateVariables
): Promise<RenderedMail> {
  const content = BUILDERS[id](variables);

  return {
    subject: content.subject,
    html: await render(<MailLayout content={content} />),
    text: renderText(content),
  };
}
