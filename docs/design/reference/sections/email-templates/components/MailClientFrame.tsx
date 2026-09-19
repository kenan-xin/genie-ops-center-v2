import type { EmailTemplate } from '@/../product/sections/email-templates/types'
import { MAIL_FROM, fill, fmtMailDate, type TokenContext } from './helpers'

export interface MailClientFrameProps {
  template: EmailTemplate
  ctx: TokenContext
  /** Subject prefix, for example [Test]. */
  subjectPrefix?: string
  children: React.ReactNode
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-gray-800 dark:text-gray-200">{children}</span>
    </div>
  )
}

/**
 * A neutral mail-client header (subject, from, reply-to, to, date, preview line) over a light canvas holding the email.
 * From is the tenant's display name at the deployment's MAIL_FROM address. For a Keycloak email the same sender name and reply-to
 * come from the realm SMTP settings. The client chrome follows the page theme, the email inside stays light.
 */
export function MailClientFrame({ template: t, ctx, subjectPrefix, children }: MailClientFrameProps) {
  const f = (s: string) => fill(s, ctx)
  const kc = t.sender === 'keycloak'
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold tracking-tight">{subjectPrefix ? `${subjectPrefix} ` : ''}{f(t.subject)}</h2>
          {kc ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">Sent by Keycloak built-in template</span> : null}
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <Row label="From"><span className="font-medium">{ctx.emailSenderName}</span> <span className="text-gray-500">&lt;{MAIL_FROM}&gt;{kc ? ' · realm SMTP settings' : ''}</span></Row>
          <Row label="Reply-To">{ctx.emailReplyTo}{kc ? <span className="text-gray-500"> · realm SMTP settings</span> : null}</Row>
          <Row label="To">{ctx.recipientName} &lt;{ctx.recipientEmail}&gt;</Row>
          <Row label="Date">{fmtMailDate(ctx.sentAt)}</Row>
          <Row label="Preview"><span className="text-gray-600 dark:text-gray-400">{f(t.preheader)}</span></Row>
        </div>
      </div>
      <div className="overflow-x-auto bg-gray-100 px-4 py-8 dark:bg-gray-950/60">{children}</div>
    </div>
  )
}
