import type { EmailSampleValues, EmailTemplate, EmailTenant } from '@/../product/sections/email-templates/types'
import { SYSTEM_FONT_STACK, fontStack } from '@/sections/branding/components/helpers'

/* Color and font helpers are Branding's: one foreground rule, one font list. Re-exported so email components import from one place. */
export { focusRing, btnPrimary, btnSecondary, btnGhost, contrastRatio, foregroundFor, fontLabel, fontStack, SYSTEM_FONT_STACK } from '@/sections/branding/components/helpers'

/** The deployment sender address (`MAIL_FROM`). One per deployment; the tenant sets only the display name and reply-to. */
export const MAIL_FROM = 'no-reply@genie.example'

/** Everything a template can reference: the tenant's branding, the shared samples, and the tenant's sample recipient. */
export type TokenContext = EmailTenant & Omit<EmailSampleValues, 'recipients'> & { recipientName: string; recipientEmail: string }

export function tokenContext(tenant: EmailTenant, samples: EmailSampleValues): TokenContext {
  const { recipients, ...rest } = samples
  const r = recipients[tenant.id] ?? Object.values(recipients)[0]
  return { ...tenant, ...rest, recipientName: r.name, recipientEmail: r.email }
}

/** Replace {token} with the tenant or sample value. Unknown tokens stay visible so a typo is caught in review. */
export function fill(text: string, ctx: TokenContext) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (ctx as unknown as Record<string, unknown>)[k]
    return v === undefined || v === null ? m : String(v)
  })
}

/** Keycloak's built-in emails use the system stack only; Genie emails use the tenant font with the same stack as fallback. */
export function emailFont(t: EmailTemplate, ctx: TokenContext) {
  return t.sender === 'keycloak' ? SYSTEM_FONT_STACK : fontStack(ctx.fontFamily)
}

export function fmtMailDate(iso: string, timeZone = 'Asia/Singapore') {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone })
}

/** Wrap a paragraph at 72 characters for the text/plain part. */
export function wrap(text: string, width = 72) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > width && line) { out.push(line); line = word } else line = (line ? line + ' ' : '') + word
    }
    out.push(line)
  }
  return out.join('\n')
}

/** The text/plain alternative: same content in reading order, links written out. Keycloak's built-in text part is the heading, the first paragraph, the link, then the rest. */
export function plainText(t: EmailTemplate, ctx: TokenContext) {
  const f = (s: string) => fill(s, ctx)
  const lines: string[] = []
  if (t.sender === 'keycloak') {
    const [first, ...rest] = t.paragraphs
    lines.push(f(t.heading), '')
    if (first) lines.push(wrap(f(first)), '')
    if (t.button) lines.push(f(t.button.url), '')
    for (const p of rest) lines.push(wrap(f(p)), '')
    return lines.join('\n').trimEnd()
  }
  lines.push(ctx.companyName.toUpperCase(), '')
  if (t.eyebrow) lines.push(f(t.eyebrow).toUpperCase())
  lines.push(f(t.heading), '='.repeat(Math.min(72, f(t.heading).length)), '')
  for (const p of t.paragraphs) lines.push(wrap(f(p)), '')
  if (t.details.length) { for (const d of t.details) lines.push(`${d.label}: ${f(d.value)}`); lines.push('') }
  if (t.button) lines.push(`${f(t.button.label)}:`, f(t.button.url), '')
  if (t.buttonNote) lines.push(wrap(f(t.buttonNote)), '')
  lines.push(f(t.closing), '', '-'.repeat(40), wrap(f(t.reason)))
  lines.push(wrap(ctx.emailFooterText))
  const support = ctx.supportEmail ?? ctx.supportUrl
  if (support) lines.push(`Support: ${support}`)
  if (ctx.termsUrl) lines.push(`Terms: ${ctx.termsUrl}`)
  if (ctx.privacyUrl) lines.push(`Privacy: ${ctx.privacyUrl}`)
  lines.push(`Sent by ${ctx.productName}`)
  return lines.join('\n')
}
