export type EmailSender = 'genie' | 'keycloak'
export type FrameWidth = 'phone' | 'desktop'
export type BodyView = 'html' | 'text'

/**
 * The branding values every email reads: a subset of the Branding row plus the deployment values links need.
 * The From address is not here: it is the deployment's `MAIL_FROM`; the tenant sets only the display name and reply-to.
 */
export interface EmailTenant {
  id: string
  companyName: string
  productName: string
  /** host part of PUBLIC_URL; one per deployment. Used only for links in the email body, never for the sender address. */
  publicHost: string
  /** Keycloak base URL of the deployment (`KEYCLOAK_URL`) and this tenant's realm; credential-email links are `{keycloakUrl}/realms/{realm}/...`. */
  keycloakUrl: string
  realm: string
  /** Brokered tenants never receive the Keycloak credential emails. */
  accountType: 'brokered' | 'local'
  /** Tokenized download link for the square mark. Null shows the letter tile. */
  logoMarkUrl: string | null
  /** Letters shown in the logo mark tile when no image is set. */
  logoMarkText: string
  primaryColor: string
  /** Stored with the color (`primary_foreground`); the email reads it and never recomputes it. */
  primaryForeground: string
  /** A key from the approved list; labels and font stacks are looked up. */
  fontFamily: string
  emailSenderName: string
  emailReplyTo: string
  emailFooterText: string
  supportEmail: string | null
  supportUrl: string | null
  termsUrl: string | null
  privacyUrl: string | null
}

export interface EmailDetail {
  label: string
  value: string
}

/**
 * One template. Text fields may contain tokens such as {companyName}, {recipientName}, {roleName}; the renderer fills them from the tenant and the sample values.
 * A `keycloak` template is Keycloak's built-in wording rendered unstyled: `heading` is the realm display name, `paragraphs[0]` comes first,
 * then `button` as a plain text link, then the remaining paragraphs. `details`, `buttonNote`, `closing`, and `reason` are ignored.
 */
export interface EmailTemplate {
  id: string
  name: string
  sender: EmailSender
  /** When Genie or Keycloak sends it. Shown under the name in the list. */
  trigger: string
  /** A variant renders the same event with different copy (role removed with nothing left). Listed under its parent, not counted as its own template. */
  variantOf?: string
  /** Label of the variant switch shown under the parent in the list. */
  variantLabel?: string
  subject: string
  preheader: string
  /** Small label above the heading, used by the module notification for the module name. */
  eyebrow: string | null
  heading: string
  paragraphs: string[]
  details: EmailDetail[]
  button: { label: string; url: string } | null
  /** Line under the button: a fallback instruction for clients that block buttons. */
  buttonNote: string | null
  closing: string
  /** Why the recipient receives this, shown in the footer. */
  reason: string
}

/** Sample values for the tokens, so the preview reads like a real email. The recipient is a person of the selected tenant. */
export interface EmailSampleValues {
  recipients: Record<string, { name: string; email: string }>
  inviterName: string
  roleName: string
  scopeLabel: string
  removedBy: string
  remainingSolutions: string
  moduleName: string
  notificationTitle: string
  notificationBody: string
  actionLabel: string
  recordLabel: string
  /** New-device sign-in: the device label (browser and OS) and IP address. Never a location. */
  deviceLabel: string
  ipAddress: string
  signedInAt: string
  sentAt: string
}

export interface EmailTemplatesProps {
  tenants: EmailTenant[]
  templates: EmailTemplate[]
  sampleValues: EmailSampleValues
  /** The reviewer's address for Send test to me. */
  reviewerEmail: string
  /** Design-only initial state, read from the preview URL. */
  initialTemplateId?: string | null
  initialTenantId?: string | null
  initialWidth?: FrameWidth
  initialView?: BodyView
  /** Reviewer queues a test email of one Genie template with one sample deployment's branding to their own address. Not offered for Keycloak templates. */
  onSendTest?: (templateId: string, tenantId: string) => void
  /** Reviewer copies the plain-text alternative. */
  onCopyPlainText?: (templateId: string) => void
}
