/**
 * The R-48 template catalogue: invitation-brokered, role granted, role removed, new-device
 * sign-in and module notification. A local account gets no core email; the realm sends its
 * set-password email itself (Specification 02 R-40a). The templates and the mailer land with this
 * ticket; the events that send them land in Section 2 item 8 and the first module that notifies.
 *
 * The HTML part is rendered from React Email components (`DEC-11`, tech-stack "Email templates").
 * The plain-text part is a hand-written builder per template and is never produced from the HTML
 * with React Email's `plainText` option, so neither part is derived from the other (R-44). A
 * tokenized link lives in the template variables, so the renderer never writes a link to its own
 * output; only the mailer logs, and it logs through the redacting logger (R-49).
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  render,
} from "@react-email/components";

import { httpUrl, supportContact } from "../../lib/branding/support.ts";
import type {
  MailBrandingTheme,
  MailTemplateId,
  MailTemplateVariables,
  RenderedMail,
} from "./catalogue.ts";

export { MAIL_TEMPLATE_IDS } from "./catalogue.ts";

export type {
  MailBrandingTheme,
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

/** Who a reader contacts: the branded support contact, else a neutral label. */
function supportLabel(theme: MailBrandingTheme): string {
  return supportContact(theme)?.label ?? "your administrator";
}

function invitationBrokered(
  variables: MailTemplateVariables,
  { companyName, productName }: MailBrandingTheme
): MailContent {
  return {
    subject: `You are invited to ${productName}`,
    heading: "You are invited",
    preview: `${value(variables, "inviterName")} invited you to ${productName}.`,
    paragraphs: [
      greeting(variables),
      `${value(variables, "inviterName")} invited you to join ${companyName} on ${productName}.`,
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

function roleGranted(
  variables: MailTemplateVariables,
  theme: MailBrandingTheme
): MailContent {
  const { companyName } = theme;
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
      label: `Open ${theme.productName}`,
      url: value(variables, "link"),
    },
    footer: `If you did not expect this change, contact ${supportLabel(theme)}.`,
  };
}

function roleRemoved(
  variables: MailTemplateVariables,
  theme: MailBrandingTheme
): MailContent {
  const { companyName } = theme;
  const roleName = value(variables, "roleName");

  return {
    subject: `Your ${roleName} role was removed`,
    heading: "Role removed",
    preview: `The ${roleName} role was removed from your account.`,
    paragraphs: [
      greeting(variables),
      `The ${roleName} role at ${companyName} was removed from your account.`,
      `If you believe this is a mistake, contact ${supportLabel(theme)}.`,
    ],
    action: {
      label: `Open ${theme.productName}`,
      url: value(variables, "link"),
    },
    footer: `You received this email because your role at ${companyName} changed.`,
  };
}

function newDeviceSignIn(
  variables: MailTemplateVariables,
  theme: MailBrandingTheme
): MailContent {
  const { productName } = theme;

  return {
    subject: `New sign-in to ${productName}`,
    heading: "New device sign-in",
    preview: `Your account signed in from ${value(variables, "deviceName")}.`,
    paragraphs: [
      greeting(variables),
      `Your account signed in from ${value(variables, "deviceName")}.`,
      `If this was not you, contact ${supportLabel(theme)}.`,
    ],
    action: {
      label: "Review your account",
      url: value(variables, "link"),
    },
    footer: `You received this email because ${productName} saw a sign-in from a new device.`,
  };
}

function moduleNotification(
  variables: MailTemplateVariables,
  { companyName }: MailBrandingTheme
): MailContent {
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
    footer: `You received this email because ${companyName} enabled ${moduleName}.`,
  };
}

/**
 * One content builder per catalogue id, so a new id is a compile error until it has a builder.
 * Names and the support contact come from branding, never from the variables (R-59a).
 */
const BUILDERS: Readonly<
  Record<
    MailTemplateId,
    (variables: MailTemplateVariables, theme: MailBrandingTheme) => MailContent
  >
> = {
  "invitation-brokered": invitationBrokered,
  "role-granted": roleGranted,
  "role-removed": roleRemoved,
  "new-device-sign-in": newDeviceSignIn,
  "module-notification": moduleNotification,
};

/**
 * The fixed neutrals of the layout. Emails always render light, so only the primary pair and the
 * names come from branding (R-59a). The face stays the default face, as on the web (R-14).
 */
const STYLES = {
  body: {
    backgroundColor: "#f4f5f7",
    fontFamily: '"Plus Jakarta Sans", Arial, Helvetica, sans-serif',
  },
  container: {
    backgroundColor: "#ffffff",
    margin: "0 auto",
    maxWidth: "560px",
  },
  bar: { padding: "16px 32px" },
  company: { fontSize: "16px", fontWeight: 600, margin: 0 },
  card: { padding: "8px 32px 32px" },
  heading: { color: "#111827", fontSize: "22px" },
  paragraph: { color: "#374151", fontSize: "15px", lineHeight: "24px" },
  button: { borderRadius: "6px", fontSize: "15px", padding: "12px 20px" },
  url: { color: "#6b7280", fontSize: "12px", wordBreak: "break-all" as const },
  rule: { borderColor: "#e5e7eb" },
  footer: { color: "#6b7280", fontSize: "12px", margin: "4px 0" },
  footerLink: { color: "#6b7280", textDecoration: "underline" },
};

/** The one branded layout every catalogue template renders through (email spec, layout order). */
function MailLayout({
  content,
  theme,
}: {
  readonly content: MailContent;
  readonly theme: MailBrandingTheme;
}) {
  const support = supportContact(theme);
  const termsUrl = httpUrl(theme.termsUrl);
  const privacyUrl = httpUrl(theme.privacyUrl);

  return (
    <Html lang="en">
      <Head />
      <Preview>{content.preview}</Preview>
      <Body style={STYLES.body}>
        <Container style={STYLES.container}>
          <Section
            style={{ ...STYLES.bar, backgroundColor: theme.primaryColor }}
          >
            <Text style={{ ...STYLES.company, color: theme.primaryForeground }}>
              {theme.companyName}
            </Text>
          </Section>
          <Section style={STYLES.card}>
            <Heading style={STYLES.heading}>{content.heading}</Heading>
            {content.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={STYLES.paragraph}>
                {paragraph}
              </Text>
            ))}
            <Button
              href={content.action.url}
              style={{
                ...STYLES.button,
                backgroundColor: theme.primaryColor,
                color: theme.primaryForeground,
              }}
            >
              {content.action.label}
            </Button>
            <Text style={STYLES.url}>{content.action.url}</Text>
            <Hr style={STYLES.rule} />
            <Text style={STYLES.footer}>{content.footer}</Text>
            {theme.footerText === null ? null : (
              <Text style={STYLES.footer}>{theme.footerText}</Text>
            )}
            {support === null ? null : (
              <Text style={STYLES.footer}>
                Support:{" "}
                <Link href={support.href} style={STYLES.footerLink}>
                  {support.label}
                </Link>
              </Text>
            )}
            {termsUrl === null && privacyUrl === null ? null : (
              <Text style={STYLES.footer}>
                {termsUrl === null ? null : (
                  <Link href={termsUrl} style={STYLES.footerLink}>
                    Terms
                  </Link>
                )}
                {termsUrl !== null && privacyUrl !== null ? " · " : null}
                {privacyUrl === null ? null : (
                  <Link href={privacyUrl} style={STYLES.footerLink}>
                    Privacy
                  </Link>
                )}
              </Text>
            )}
            <Text style={STYLES.footer}>{theme.productName}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * The plain-text part, written here and never derived from the rendered HTML (R-44). It keeps the
 * HTML reading order and writes every link out in full (R-56).
 */
function renderText(content: MailContent, theme: MailBrandingTheme): string {
  const support = supportContact(theme);
  const termsUrl = httpUrl(theme.termsUrl);
  const privacyUrl = httpUrl(theme.privacyUrl);

  const footer = [
    content.footer,
    theme.footerText,
    support === null ? null : `Support: ${support.label}`,
    termsUrl === null ? null : `Terms: ${termsUrl}`,
    privacyUrl === null ? null : `Privacy: ${privacyUrl}`,
    theme.productName,
  ].filter((line) => line !== null);

  return [
    theme.companyName,
    "",
    content.heading,
    "",
    ...content.paragraphs,
    "",
    `${content.action.label}: ${content.action.url}`,
    "",
    ...footer,
  ].join("\n");
}

/**
 * Renders one catalogue template to its subject, its HTML part and its plain-text part (R-44),
 * with every color, name and footer line taken from the typed branding object (R-59a).
 */
export async function renderMailTemplate(
  id: MailTemplateId,
  variables: MailTemplateVariables,
  theme: MailBrandingTheme
): Promise<RenderedMail> {
  const content = BUILDERS[id](variables, theme);

  return {
    subject: content.subject,
    html: await render(<MailLayout content={content} theme={theme} />),
    text: renderText(content, theme),
  };
}
