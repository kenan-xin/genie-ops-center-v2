import { useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, Mail, Monitor, Smartphone, Send, X } from 'lucide-react'
import type { BodyView, EmailTemplate, EmailTemplatesProps, FrameWidth } from '@/../product/sections/email-templates/types'
import { btnGhost, btnPrimary, btnSecondary, contrastRatio, focusRing, fontLabel, plainText, tokenContext } from './helpers'
import { EmailBody } from './EmailBody'
import { MailClientFrame } from './MailClientFrame'

export type EmailGalleryProps = EmailTemplatesProps

function Segmented<T extends string>({ value, onChange, options, label, disabled }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string; icon?: React.ComponentType<{ className?: string; strokeWidth?: number }> }>; label: string; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex h-10 items-center rounded-xl border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-950 ${disabled ? 'opacity-50' : ''}`}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button key={o.id} role="radio" aria-checked={active} type="button" disabled={disabled} onClick={() => onChange(o.id)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold motion-safe:transition-colors disabled:cursor-not-allowed ${focusRing} ${active ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
            {o.icon ? <o.icon className="size-5" strokeWidth={2} /> : null}{o.label}
          </button>
        )
      })}
    </div>
  )
}

export function EmailGallery(p: EmailGalleryProps) {
  const [templateId, setTemplateId] = useState(p.initialTemplateId ?? p.templates[0]?.id)
  const [tenantId, setTenantId] = useState(p.initialTenantId ?? p.tenants[0]?.id)
  const [width, setWidth] = useState<FrameWidth>(() => p.initialWidth ?? (window.innerWidth < 640 ? 'phone' : 'desktop'))
  const [view, setView] = useState<BodyView>(p.initialView ?? 'html')
  const [toast, setToast] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** After Send test the frame shows the [Test] subject prefix until the template or tenant changes. */
  const [tested, setTested] = useState(false)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  const template = p.templates.find((t) => t.id === templateId) ?? p.templates[0]
  const tenant = p.tenants.find((t) => t.id === tenantId) ?? p.tenants[0]
  if (!template || !tenant) return null
  const ctx = tokenContext(tenant, p.sampleValues)
  const kc = template.sender === 'keycloak'
  const brokered = tenant.accountType === 'brokered'
  const shownView: BodyView = kc ? 'html' : view
  const ratio = contrastRatio(tenant.primaryColor, tenant.primaryForeground)
  const px = width === 'phone' ? 360 : 600
  /** Variants (role removed with nothing left) are listed under their parent and are not counted as templates of their own. */
  const variantsOf = (id: string) => p.templates.filter((t) => t.variantOf === id)
  const groups: Array<[string, string, EmailTemplate[]]> = [
    ['genie', 'Genie sends', p.templates.filter((t) => t.sender === 'genie' && !t.variantOf)],
    ['keycloak', 'Keycloak sends', p.templates.filter((t) => t.sender === 'keycloak' && !t.variantOf)],
  ]
  const parentId = template.variantOf ?? template.id
  const pickTemplate = (id: string) => { setTemplateId(id); setTested(false) }
  const pickTenant = (id: string) => { setTenantId(id); setTested(false) }

  const sendTest = () => { p.onSendTest?.(template.id, tenant.id); setTested(true); setToast(`Test email queued to ${p.reviewerEmail}`) }
  const copyText = () => { navigator.clipboard?.writeText(plainText(template, ctx)).catch(() => undefined); p.onCopyPlainText?.(template.id); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  const kcNote = "Sent by Keycloak's built-in template. Test it from the realm."
  const kcBadge = <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">Keycloak</span>

  return (
    <div className="min-h-dvh bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="border-b border-gray-200 px-4 py-4 md:px-6 lg:px-8 dark:border-gray-800">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Mail className="size-5" strokeWidth={2} aria-hidden /></span>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Email templates</h1>
            <p className="text-xs text-gray-600 dark:text-gray-400">Every Genie email reads the deployment's branding; two sample deployments are shown side by side. Genie sends six templates through React Email; Keycloak sends three credential emails with its built-in templates, which print the realm display name only.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-4 md:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-6">
        {/* Template list: select on phones, list from lg */}
        <nav aria-label="Templates" className="lg:w-[280px] lg:shrink-0">
          <label className="flex flex-col gap-1.5 lg:hidden">
            <span className="text-sm font-semibold">Template</span>
            <span className="relative">
              <select value={template.id} onChange={(e) => pickTemplate(e.target.value)} className={`h-11 w-full appearance-none rounded-xl border border-gray-300 bg-white pl-3 pr-10 text-sm dark:border-gray-700 dark:bg-gray-950 ${focusRing}`}>
                {groups.map(([id, label, list]) => <optgroup key={id} label={id === 'keycloak' && brokered ? `${label} (local-account deployments only)` : label}>{list.flatMap((t) => [t, ...variantsOf(t.id)]).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" strokeWidth={2} aria-hidden />
            </span>
          </label>
          <div className="hidden flex-col gap-5 rounded-2xl bg-gray-50 p-3 lg:flex dark:bg-gray-900">
            {groups.map(([id, label, list]) => (
              <div key={id}>
                <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                {id === 'keycloak' && brokered ? <p className="px-2 pb-2 text-xs text-gray-600 dark:text-gray-400">Local-account deployments only. {tenant.companyName} signs in through its identity provider, so its people never receive these.</p> : null}
                <ul className="flex flex-col gap-0.5">
                  {list.map((t) => {
                    const active = t.id === parentId
                    const variants = variantsOf(t.id)
                    return (
                      <li key={t.id}>
                        <button type="button" aria-current={t.id === template.id ? 'true' : undefined} onClick={() => pickTemplate(t.id)} className={`flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left motion-safe:transition-colors ${focusRing} ${active ? 'bg-white shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700' : 'hover:bg-white/70 dark:hover:bg-gray-800/60'}`}>
                          <span className="flex items-center gap-2"><span className={`text-sm font-semibold ${active ? 'text-blue-700 dark:text-blue-300' : ''}`}>{t.name}</span>{t.sender === 'keycloak' ? kcBadge : null}</span>
                          <span className="line-clamp-2 text-xs text-gray-600 dark:text-gray-400">{t.trigger}</span>
                        </button>
                        {active && variants.length ? (
                          <div role="radiogroup" aria-label={`${t.name} variant`} className="mt-1 flex flex-wrap gap-1 px-3 pb-1">
                            {[t, ...variants].map((v) => (
                              <button key={v.id} type="button" role="radio" aria-checked={v.id === template.id} onClick={() => pickTemplate(v.id)} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${focusRing} ${v.id === template.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>{v.variantLabel ?? v.name}</button>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <span className="sr-only">Sample deployment</span>
              <span className="relative">
                <select aria-label="Sample deployment" value={tenant.id} onChange={(e) => pickTenant(e.target.value)} className={`h-10 appearance-none rounded-xl border border-gray-300 bg-white pl-3 pr-9 text-sm font-medium dark:border-gray-700 dark:bg-gray-950 ${focusRing}`}>
                  {p.tenants.map((t) => <option key={t.id} value={t.id}>{t.companyName}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" strokeWidth={2} aria-hidden />
              </span>
              <span title="Primary color against its stored foreground" className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${ratio >= 4.5 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}><span className="size-4 rounded-full ring-1 ring-black/10" style={{ background: tenant.primaryColor }} />{ratio.toFixed(1)}:1 {ratio >= 4.5 ? 'AA' : 'fails AA'}</span>
            </label>
            <Segmented label="Frame width" value={width} onChange={setWidth} options={[{ id: 'phone', label: 'Phone', icon: Smartphone }, { id: 'desktop', label: 'Desktop', icon: Monitor }]} />
            <Segmented label="Body view" value={shownView} onChange={setView} disabled={kc} options={[{ id: 'html', label: 'HTML' }, { id: 'text', label: 'Plain text' }]} />
            <div className="ml-auto flex gap-2">
              {shownView === 'text' ? <button type="button" className={btnSecondary} onClick={copyText}>{copied ? <><Check className="size-5 text-emerald-600" strokeWidth={2.5} aria-hidden />Copied</> : <><Copy className="size-5" strokeWidth={1.75} aria-hidden />Copy text</>}</button> : null}
              <button type="button" className={btnPrimary} disabled={kc} title={kc ? kcNote : undefined} onClick={sendTest}><Send className="size-5" strokeWidth={2} aria-hidden />Send test to me</button>
            </div>
          </div>
          {kc ? <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{kcNote}{brokered ? ` ${tenant.companyName} is brokered; only local-account deployments receive this email.` : ''}</p> : null}

          <div className="mt-4">
            <MailClientFrame template={template} ctx={ctx} subjectPrefix={tested ? '[Test]' : undefined}>
              {shownView === 'html' ? (
                <EmailBody template={template} ctx={ctx} width={px} />
              ) : (
                <pre style={{ width: px }} className="mx-auto max-w-full overflow-x-auto whitespace-pre rounded-2xl border border-gray-200 bg-white p-5 font-mono text-xs leading-relaxed text-gray-800">{plainText(template, ctx)}</pre>
              )}
            </MailClientFrame>
          </div>

          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex gap-1"><dt className="font-semibold">Sample recipient</dt><dd>{ctx.recipientName}</dd></div>
            <div className="flex gap-1"><dt className="font-semibold">Inviter</dt><dd>{p.sampleValues.inviterName}</dd></div>
            <div className="flex gap-1"><dt className="font-semibold">Role</dt><dd>{p.sampleValues.roleName} on {p.sampleValues.scopeLabel}</dd></div>
            <div className="flex gap-1"><dt className="font-semibold">Module</dt><dd>{p.sampleValues.moduleName}</dd></div>
            <div className="flex gap-1"><dt className="font-semibold">Font</dt><dd>{kc ? 'System stack (Keycloak built-in)' : `${fontLabel(tenant.fontFamily)}, system fallback`}</dd></div>
          </dl>
        </main>
      </div>

      {toast ? (
        <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 md:inset-x-auto md:right-6 md:px-0">
          <div className="flex items-center gap-2 rounded-xl bg-gray-900 py-2 pl-4 pr-2 text-sm font-medium text-white shadow-lg dark:bg-gray-100 dark:text-gray-900">
            {toast}
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className={`${btnGhost} size-8 justify-center px-0 text-gray-300 hover:bg-white/10 hover:text-white dark:text-gray-600 dark:hover:bg-gray-900/10 dark:hover:text-gray-900`}><X className="size-5" strokeWidth={2} /></button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
