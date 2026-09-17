import type { EmailTemplate } from '@/../product/sections/email-templates/types'
import { SYSTEM_FONT_STACK, emailFont, fill, focusRing, type TokenContext } from './helpers'

export interface EmailBodyProps {
  template: EmailTemplate
  ctx: TokenContext
  /** 360 for phones, 600 for desktop clients. */
  width: number
}

/**
 * Keycloak's built-in template, as the realm sends it (DEC-40): plain white, system font, no bar, mark, or colored button.
 * Only the realm display name (the company name) comes from the deployment; the link is a plain text link.
 */
function KeycloakBody({ template: t, ctx, width }: EmailBodyProps) {
  const f = (s: string) => fill(s, ctx)
  const [first, ...rest] = t.paragraphs
  return (
    <div style={{ width, fontFamily: SYSTEM_FONT_STACK }} className="mx-auto bg-white px-6 py-6 text-base leading-relaxed text-black">
      <p className="text-2xl">{f(t.heading)}</p>
      {first ? <p className="mt-4">{f(first)}</p> : null}
      {t.button ? <p className="mt-4"><a href={f(t.button.url)} onClick={(e) => e.preventDefault()} className={`text-blue-700 underline ${focusRing}`}>{f(t.button.label)}</a></p> : null}
      {rest.map((p, i) => <p key={i} className="mt-4">{f(p)}</p>)}
    </div>
  )
}

/**
 * The shared email layout every Genie template renders through. Emails stay light regardless of the gallery theme.
 * Keycloak templates take the unstyled KeycloakBody path instead.
 */
export function EmailBody(props: EmailBodyProps) {
  if (props.template.sender === 'keycloak') return <KeycloakBody {...props} />
  return <GenieBody {...props} />
}

function GenieBody({ template: t, ctx, width }: EmailBodyProps) {
  const f = (s: string) => fill(s, ctx)
  const fg = ctx.primaryForeground
  const phone = width < 480
  const link = `underline ${focusRing}`
  const support = ctx.supportEmail ?? ctx.supportUrl
  return (
    <div style={{ width, fontFamily: emailFont(t, ctx) }} className="mx-auto text-base leading-relaxed text-gray-800">
      {/* Top bar */}
      <div style={{ background: ctx.primaryColor, color: fg }} className="flex items-center gap-3 rounded-t-2xl px-6 py-4">
        <span style={{ color: ctx.primaryColor }} className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-sm font-extrabold tracking-tight">
          {ctx.logoMarkUrl ? <img src={ctx.logoMarkUrl} alt="" width={28} height={28} className="size-7 object-contain" /> : ctx.logoMarkText}
        </span>
        <span className="text-base font-bold tracking-tight">{ctx.companyName}</span>
      </div>

      {/* Content card */}
      <div className={`rounded-b-2xl border border-t-0 border-gray-200 bg-white ${phone ? 'px-5 py-6' : 'px-10 py-8'}`}>
        {t.eyebrow ? <p style={{ color: ctx.primaryColor }} className="mb-2 text-xs font-bold uppercase tracking-wide">{f(t.eyebrow)}</p> : null}
        <h1 className={`font-bold tracking-tight text-gray-900 ${phone ? 'text-xl' : 'text-2xl'}`}>{f(t.heading)}</h1>
        <div className="mt-4 flex flex-col gap-3">
          {t.paragraphs.map((p, i) => <p key={i}>{f(p)}</p>)}
        </div>

        {t.details.length ? (
          <table className="mt-5 w-full border-collapse overflow-hidden rounded-xl text-sm">
            <tbody>
              {t.details.map((d) => (
                <tr key={d.label} className="border-b border-gray-100 last:border-0">
                  <th scope="row" className="w-[38%] bg-gray-50 px-4 py-2.5 text-left font-medium text-gray-600">{d.label}</th>
                  <td className="break-all px-4 py-2.5 font-medium text-gray-900">{f(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {t.button ? (
          <div className="mt-6">
            <a href={f(t.button.url)} onClick={(e) => e.preventDefault()} style={{ background: ctx.primaryColor, color: fg }} className={`inline-flex h-11 items-center justify-center rounded-xl px-6 text-base font-semibold no-underline ${focusRing} ${phone ? 'w-full' : ''}`}>{f(t.button.label)}</a>
            {t.buttonNote ? <p className="mt-3 text-sm text-gray-600">{f(t.buttonNote)}</p> : null}
            <p className="mt-2 break-all font-mono text-xs text-gray-500">{f(t.button.url)}</p>
          </div>
        ) : null}

        <p className="mt-7 text-base text-gray-800">{f(t.closing)}</p>
      </div>

      {/* Footer */}
      <div className={`text-xs leading-relaxed text-gray-500 ${phone ? 'px-5 py-5' : 'px-10 py-6'}`}>
        <p>{f(t.reason)}</p>
        <p className="mt-2">{ctx.emailFooterText}</p>
        {support ? (
          <p className="mt-2">Need help? <a href={support.includes('@') ? `mailto:${support}` : support} onClick={(e) => e.preventDefault()} className={link}>{support.replace(/^https?:\/\//, '')}</a></p>
        ) : null}
        <p className="mt-2 flex flex-wrap gap-x-3">
          {ctx.termsUrl ? <a href={ctx.termsUrl} onClick={(e) => e.preventDefault()} className={link}>Terms</a> : null}
          {ctx.privacyUrl ? <a href={ctx.privacyUrl} onClick={(e) => e.preventDefault()} className={link}>Privacy</a> : null}
          <span>Sent by {ctx.productName}</span>
        </p>
      </div>
    </div>
  )
}
