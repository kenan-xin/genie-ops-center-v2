import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronsUpDown, GripVertical, Image as ImageIcon, Info, LayoutGrid, Maximize2, Search, Star, AlertTriangle, X } from 'lucide-react'
import type { Branding, BrandingImage, ContrastTargets } from '@/../product/sections/branding/types'
import type { EmailSampleValues, EmailTemplate } from '@/../product/sections/email-templates/types'
import emailData from '@/../product/sections/email-templates/data.json'
import { EmailBody, MailClientFrame } from '@/sections/email-templates/components'
import { tokenContext } from '@/sections/email-templates/components/helpers'
import { FONT_SIZES, checkPrimaryPairs, darkVariant, emailTenantFromDraft, foregroundFor } from './helpers'

type Theme = 'light' | 'dark'

/** The tenant text color applies to light surfaces only; dark keeps the fixed gray-100. */
const surf = (t: Theme, textColor = '#111827') => ({
  page: t === 'dark' ? '#030712' : '#ffffff',
  panel: t === 'dark' ? '#111827' : '#f9fafb',
  card: t === 'dark' ? '#111827' : '#ffffff',
  line: t === 'dark' ? '#1f2937' : '#e5e7eb',
  text: t === 'dark' ? '#f3f4f6' : textColor,
  muted: t === 'dark' ? '#9ca3af' : '#4b5563',
})

/** The square mark when one is uploaded and scanned, the letter tile otherwise. A Scanning image is not shown. */
export function Mark({ b, mark, size = 28 }: { b: Branding; mark: BrandingImage | null; size?: number }) {
  const usable = mark && mark.scanStatus !== 'pending' && mark.scanStatus !== 'infected' && mark.url
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border" style={{ width: size, height: size, borderColor: '#e5e7eb', backgroundColor: '#fff', color: b.primaryColor, fontSize: size * 0.5, fontWeight: 800 }}>
      {usable ? <img src={mark.url ?? undefined} alt="" width={size} height={size} className="size-full object-contain" /> : b.companyName.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Scales a 1280 by 800 desktop frame to the width of its container, so the preview reads like the real product at a glance. */
function ScaledFrame({ children, width = 1280, height = 800 }: { children: React.ReactNode; width?: number; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setW(entries[0]?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = w ? w / width : 0
  return (
    <div ref={ref} className="w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800" style={{ height: Math.round(height * scale) || undefined }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

const SAMPLE_SOLUTIONS = [
  { mono: 'CT', color: '#0f766e', name: 'Claims Triage Assistant', desc: 'Sorts incoming insurance claims by urgency and flags missing documents.', cat: 'Healthcare', star: true },
  { mono: 'DS', color: '#2563eb', name: 'Discharge Summary Drafting', desc: 'Drafts a discharge summary from ward notes for a clinician to sign.', cat: 'Healthcare', star: false },
  { mono: 'RL', color: '#7c3aed', name: 'Referral Letter Review', desc: 'Checks outgoing referral letters for completeness.', cat: 'Healthcare', star: false, status: 'Maintenance' },
  { mono: 'PQ', color: '#1f2937', name: 'Policy Q&A', desc: 'Answers questions about finance and procurement policies with citations.', cat: 'Finance', star: true },
  { mono: 'VI', color: '#b45309', name: 'Vendor Invoice Checker', desc: 'Compares a vendor invoice against its purchase order.', cat: 'Finance', star: false, status: 'Down' },
  { mono: 'BP', color: '#0369a1', name: 'Benefits Portal', desc: 'The HR benefits self-service portal, opened inside Genie.', cat: 'People and HR', star: false, embedded: true },
]

/** Full desktop shell at 1280px, scaled to fit: the real sidebar shape (tenant block, workspace entries, pinned rail, category tree, user footer) and the Solutions hub. Only the active nav row, count pills, the primary button, and the focus ring take the tenant primary; chrome stays neutral. */
export function ShellPreview({ b, mark, theme, fontStack, showContrast, targets }: { b: Branding; mark: BrandingImage | null; theme: Theme; fontStack: string; showContrast: boolean; targets: ContrastTargets }) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])
  const s = surf(theme, b.textColor)
  /* A solid fill keeps the raw color in both themes (tokens: no derived shade); only text and the ring take the dark variant. */
  const primary = theme === 'dark' ? darkVariant(b.primaryColor) : b.primaryColor
  const onPrimary = { backgroundColor: b.primaryColor, color: foregroundFor(b.primaryColor) }
  const activeRow = theme === 'dark' ? { backgroundColor: '#111827', color: darkVariant(b.primaryColor), boxShadow: `inset 0 0 0 1px ${s.line}` } : { backgroundColor: '#ffffff', color: b.primaryColor, boxShadow: `inset 0 0 0 1px ${s.line}` }
  const tonePill = (label: string) => {
    const tone = label === 'Down' ? ['#fef2f2', '#b91c1c'] : label === 'Maintenance' ? ['#fffbeb', '#92400e'] : [s.panel, s.muted]
    return <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: theme === 'dark' ? '#1f2937' : tone[0], color: theme === 'dark' ? '#d1d5db' : tone[1] }}>{label}</span>
  }
  const card = (x: (typeof SAMPLE_SOLUTIONS)[number]) => (
    <div key={x.name} className="flex gap-3 rounded-2xl border p-4" style={{ borderColor: s.line, backgroundColor: s.card }}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold" style={{ backgroundColor: x.color, color: foregroundFor(x.color) }}>{x.mono}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate font-semibold">{x.name}</span>{tonePill(x.embedded ? 'Embedded' : 'Chat')}{x.status ? tonePill(x.status) : null}</div>
        <div className="mt-0.5 line-clamp-2 text-sm" style={{ color: s.muted }}>{x.desc}</div>
      </div>
      <Star className="size-4 shrink-0" style={{ color: x.star ? '#f59e0b' : s.line }} strokeWidth={2} fill={x.star ? 'currentColor' : 'none'} aria-hidden />
    </div>
  )
  const groups = ['Healthcare', 'Finance', 'People and HR'].map((g) => ({ label: g, items: SAMPLE_SOLUTIONS.filter((x) => x.cat === g) }))
  const frame = (
    <div className="flex h-full gap-3 p-3" style={{ backgroundColor: s.page, color: s.text, fontFamily: fontStack, fontSize: FONT_SIZES[b.fontSize] }}>
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col rounded-2xl border p-3" style={{ backgroundColor: s.panel, borderColor: s.line }}>
        <div className="flex items-center gap-3 px-1 py-1"><Mark b={b} mark={mark} size={40} /><div className="min-w-0"><div className="truncate font-bold">{b.companyName || 'Company'}</div><div className="truncate text-xs" style={{ color: s.muted }}>{b.productName}</div></div></div>
        <div className="mt-4 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: s.muted }}>Workspace</div>
        <div className="mt-1 flex h-10 items-center gap-2.5 rounded-xl px-3 font-semibold" style={activeRow}><LayoutGrid className="size-[18px]" strokeWidth={2} aria-hidden />Solutions</div>
        <div className="flex h-10 items-center gap-2.5 px-3" style={{ color: s.text }}><Star className="size-[18px]" strokeWidth={1.75} aria-hidden />Favorites</div>
        <div className="mt-4 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: s.muted }}>Pinned</div>
        {SAMPLE_SOLUTIONS.filter((x) => x.star).map((x) => <div key={x.name} className="flex h-9 items-center gap-2 px-2" style={{ color: s.text }}><GripVertical className="size-4" style={{ color: s.muted }} strokeWidth={1.75} aria-hidden /><span className="truncate">{x.name}</span></div>)}
        <div className="mt-4 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: s.muted }}>Solutions</div>
        {groups.map((g) => (
          <div key={g.label}>
            <div className="flex h-9 items-center gap-2 px-2" style={{ color: s.text }}><ChevronDown className="size-4" style={{ color: s.muted }} strokeWidth={2} aria-hidden /><span className="flex-1 truncate font-medium">{g.label}</span><span className="rounded-full px-1.5 text-xs font-bold" style={onPrimary}>{g.items.length}</span></div>
            {g.items.map((x) => <div key={x.name} className="truncate py-1.5 pl-8 pr-2 text-sm" style={{ color: s.text }}>{x.name}</div>)}
          </div>
        ))}
        <div className="mt-auto flex items-center gap-3 px-1 pt-3"><span className="flex size-9 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: theme === 'dark' ? '#1e3a8a' : '#dbeafe', color: theme === 'dark' ? '#bfdbfe' : '#1d4ed8' }}>AM</span><div className="min-w-0 flex-1"><div className="truncate font-semibold">Alex Morgan</div><div className="truncate font-mono text-xs uppercase tracking-wide" style={{ color: s.muted }}>Workspace member</div></div><ChevronsUpDown className="size-4" style={{ color: s.muted }} strokeWidth={1.75} aria-hidden /></div>
      </aside>
      {/* Content */}
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div><div className="font-bold tracking-tight" style={{ fontSize: '1.6em' }}>Solutions</div><div style={{ color: s.muted }}>Your solutions, grouped by category.</div></div>
          <div className="flex h-10 w-56 items-center gap-2 rounded-xl border px-3" style={{ borderColor: s.line, backgroundColor: s.card, color: s.muted }}><Search className="size-4" strokeWidth={1.75} aria-hidden />Search solutions</div>
        </div>
        <div className="flex items-center gap-2"><span className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 font-semibold" style={onPrimary}>Open Claims Triage Assistant</span><span className="inline-flex h-10 items-center rounded-xl px-3 font-semibold" style={{ backgroundColor: s.card, color: s.text, boxShadow: `inset 0 0 0 1px ${s.line}` }}>Details</span><span className="inline-flex h-10 items-center rounded-xl px-3" style={{ boxShadow: `0 0 0 2px ${primary}`, color: s.muted }}>Focused control</span></div>
        {groups.map((g) => (
          <section key={g.label}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: s.muted }}>{g.label} · {g.items.length}</div>
            <div className="grid grid-cols-3 gap-3">{g.items.map(card)}</div>
          </section>
        ))}
      </main>
    </div>
  )
  const chip = (label: string, color: string) => {
    const pairs = checkPrimaryPairs(color, targets).filter((x) => x.theme === theme)
    const r = Math.min(...pairs.map((x) => x.ratio))
    const ok = pairs.every((x) => x.ok)
    const style = theme === 'dark' ? { backgroundColor: 'transparent', color: darkVariant(color), boxShadow: `inset 0 0 0 1px ${darkVariant(color)}` } : { backgroundColor: color, color: foregroundFor(color) }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold" style={{ ...style, outline: ok ? undefined : '2px solid #dc2626', outlineOffset: 1 }}>
        {ok ? null : <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />}{label} {r.toFixed(1)}:1
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <ScaledFrame>{frame}</ScaledFrame>
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs" style={{ color: '#6b7280' }}>
        <span>Desktop at 1280px, scaled to fit.</span>
        <span className="flex items-center gap-2">{showContrast ? chip('Primary', b.primaryColor) : null}<button type="button" onClick={() => setExpanded(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950"><Maximize2 className="size-3.5" strokeWidth={2} aria-hidden />Enlarge</button></span>
      </div>
      {expanded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4 md:p-8" onClick={() => setExpanded(false)}>
          <div role="dialog" aria-modal="true" aria-label="Shell preview, enlarged" className="w-full max-w-[1240px] rounded-2xl bg-white p-3 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1"><span className="text-sm font-semibold">Shell preview</span><button type="button" aria-label="Close" onClick={() => setExpanded(false)} className="flex size-9 items-center justify-center rounded-lg text-gray-500 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:hover:bg-gray-900 dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-950"><X className="size-4" strokeWidth={1.75} /></button></div>
            <ScaledFrame>{frame}</ScaledFrame>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SignInPreview({ b, mark, theme, fontStack }: { b: Branding; mark: BrandingImage | null; theme: Theme; fontStack: string }) {
  const s = surf(theme, b.textColor)
  return (
    <div className="flex flex-col items-center rounded-xl border px-4 py-6" style={{ backgroundColor: theme === 'dark' ? '#030712' : b.loginBackgroundColor, borderColor: s.line, color: s.text, fontFamily: fontStack, fontSize: FONT_SIZES[b.fontSize] }}>
      <Mark b={b} mark={mark} size={36} />
      <div className="mt-2 font-bold">{b.companyName}</div>
      <div className="text-xs" style={{ color: s.muted }}>{b.productName}</div>
      <div className="mt-4 w-full max-w-[300px] rounded-xl border p-4" style={{ backgroundColor: s.card, borderColor: s.line }}>
        <div className="font-bold" style={{ fontSize: '1.25em' }}>Sign in</div>
        <div className="mt-1" style={{ color: s.muted }}>{b.loginWelcomeText}</div>
        {b.loginNoticeText ? (
          <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: s.line, backgroundColor: s.panel }}>
            <div className="flex items-center gap-1 text-xs font-semibold"><Info className="size-4" style={{ color: s.muted }} strokeWidth={2} aria-hidden />System use</div>
            <div className="mt-1 line-clamp-3 text-xs" style={{ color: s.muted }}>{b.loginNoticeText}</div>
            {b.loginNoticeRequiresAcknowledgement ? <div className="mt-2 flex items-center gap-1.5 text-xs"><span className="size-3 rounded border" style={{ borderColor: s.muted }} />I have read and accept these conditions.</div> : null}
          </div>
        ) : null}
        <div className="mt-3 flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-center font-semibold" style={{ backgroundColor: b.primaryColor, color: foregroundFor(b.primaryColor) }}>Continue with your company account<ArrowRight className="size-4 shrink-0" strokeWidth={2} aria-hidden /></div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-3 text-xs" style={{ color: s.muted }}>{b.supportEmail ?? b.supportUrl ? <span>{b.supportEmail ?? b.supportUrl}</span> : null}{b.termsUrl ? <span>Terms of use</span> : null}{b.privacyUrl ? <span>Privacy</span> : null}</div>
    </div>
  )
}

const INVITATION = (emailData.templates as EmailTemplate[]).find((t) => t.id === 'invitation-brokered')!
const SAMPLES = emailData.sampleValues as EmailSampleValues

/** The real invitation template in the real mail-client frame, with the draft values. The email stays light in dark mode. */
export function EmailPreview({ b, mark }: { b: Branding; mark: BrandingImage | null }) {
  const ctx = { ...tokenContext(emailTenantFromDraft(b, mark), SAMPLES) }
  // ponytail: the email body is owned by email-templates and sets its own size and color classes; override them from here rather than thread two more props through.
  return (
    <div className="text-sm [&_.text-base]:text-[length:1em] [&_.text-gray-800]:text-[color:inherit]" style={{ fontSize: FONT_SIZES[b.fontSize], color: b.textColor }}>
      <MailClientFrame template={INVITATION} ctx={ctx}>
        <EmailBody template={INVITATION} ctx={ctx} width={360} />
      </MailClientFrame>
    </div>
  )
}

export function FooterPreview({ b, theme }: { b: Branding; theme: Theme }) {
  const s = surf(theme, b.textColor)
  const items = [b.supportUrl ? 'Support' : b.supportEmail, b.termsUrl ? 'Terms of use' : null, b.privacyUrl ? 'Privacy policy' : null].filter(Boolean) as string[]
  return (
    <div className="rounded-xl border text-xs" style={{ borderColor: s.line, backgroundColor: s.page, color: s.text }}>
      <div className="h-24 rounded-t-xl" style={{ backgroundColor: s.panel }} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: s.line }}>
        <span style={{ color: s.muted }}>© 2026 {b.companyName}</span>
        <div className="flex flex-wrap gap-4">{items.map((i) => <span key={i} className="font-medium" style={{ color: b.primaryColor }}>{i}</span>)}{items.length === 0 ? <span style={{ color: s.muted }}>No links set</span> : null}</div>
      </div>
      <p className="px-4 pb-3 text-xs" style={{ color: s.muted }}>The support contact here is also the one shown on the sign-in page and in every email footer.</p>
    </div>
  )
}

export function LocalePreview({ b, theme }: { b: Branding; theme: Theme }) {
  const s = surf(theme, b.textColor)
  const now = new Date('2026-09-16T09:45:00Z')
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: b.defaultTimeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  const monthShort = new Intl.DateTimeFormat('en-GB', { timeZone: b.defaultTimeZone, month: 'short' }).format(now)
  const date = b.dateFormat.replace('yyyy', get('year')).replace('MMM', monthShort).replace('MM', get('month')).replace('dd', get('day')).replace(/(^|[^d])d([^d]|$)/, `$1${String(Number(get('day')))}$2`)
  const num = b.numberFormat === '1.234.567,89' ? '1.234.567,89' : b.numberFormat === '1 234 567,89' ? '1 234 567,89' : '1,234,567.89'
  const rows: Array<[string, string]> = [['Language', b.defaultLocale === 'en' ? 'English' : b.defaultLocale], ['Time zone', b.defaultTimeZone.replace('_', ' ')], ['Today', date], ['Time now', `${get('hour')}:${get('minute')}`], ['Number', num]]
  return (
    <div className="rounded-xl border p-4 text-sm" style={{ borderColor: s.line, backgroundColor: s.page, color: s.text }}>
      <dl className="grid grid-cols-[110px_1fr] gap-y-2">{rows.map(([k, v]) => <div key={k} className="contents"><dt style={{ color: s.muted }}>{k}</dt><dd className="font-mono">{v}</dd></div>)}</dl>
      <p className="mt-3 text-xs" style={{ color: s.muted }}>People can override language and time zone for themselves on their account page.</p>
    </div>
  )
}

/** Placeholder used only while an image has no preview yet. */
export function ImagePlaceholder({ size }: { size: number }) {
  return <ImageIcon className="text-gray-400" style={{ width: size, height: size }} strokeWidth={1.5} aria-hidden />
}
