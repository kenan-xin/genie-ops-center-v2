/**
 * The R-48 template catalogue: invitation with a brokered and a local-account variant, role
 * granted, role removed, new-device sign-in and module notification. The templates and the mailer
 * land with this ticket; the events that send them land in Section 2 item 8 and the first module
 * that notifies.
 *
 * Every template renders an HTML part and a plain-text part that are written separately, so
 * neither adapter derives one part from the other (R-44). A tokenized link lives in the template
 * variables, so the renderer never writes a link to its own output; only the mailer logs, and it
 * logs through the redacting logger (R-49).
 */

export const MAIL_TEMPLATE_IDS = [
  "invitation-brokered",
  "invitation-local-account",
  "role-granted",
  "role-removed",
  "new-device-sign-in",
  "module-notification",
] as const;

export type MailTemplateId = (typeof MAIL_TEMPLATE_IDS)[number];

/** The values one template reads. A missing value renders empty text, never the word `undefined`. */
export type MailTemplateVariables = Readonly<Record<string, string>>;

export type RenderedMail = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

/** The one link a template offers, as a button in HTML and a labelled url in plain text. */
type MailAction = {
  readonly label: string;
  readonly url: string;
};

type MailContent = {
  readonly subject: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly action: MailAction;
  readonly footer: string;
};

/** The five characters that change the meaning of an HTML part once a value is placed in it. */
function escapeHtmlCharacter(character: string): string {
  switch (character) {
    case "&":
      return "&amp;";
    case "<":
      return "&lt;";
    case ">":
      return "&gt;";
    case '"':
      return "&quot;";
    case "'":
      return "&#39;";
    default:
      return character;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, escapeHtmlCharacter);
}

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

/** One builder per catalogue id, so a new id is a compile error until it has a builder. */
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

function renderHtml(content: MailContent): string {
  const paragraphs = content.paragraphs
    .map((paragraph) => `    <p>${escapeHtml(paragraph)}</p>`)
    .join("\n");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <body>",
    `    <h1>${escapeHtml(content.heading)}</h1>`,
    paragraphs,
    `    <p><a href="${escapeHtml(content.action.url)}">${escapeHtml(content.action.label)}</a></p>`,
    `    <p>${escapeHtml(content.footer)}</p>`,
    "  </body>",
    "</html>",
  ].join("\n");
}

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
export function renderMailTemplate(
  id: MailTemplateId,
  variables: MailTemplateVariables
): RenderedMail {
  const content = BUILDERS[id](variables);

  return {
    subject: content.subject,
    html: renderHtml(content),
    text: renderText(content),
  };
}
