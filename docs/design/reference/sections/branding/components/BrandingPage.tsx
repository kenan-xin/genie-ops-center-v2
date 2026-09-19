import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, CloudUpload, Loader2, RefreshCw, Trash2, Wand2, X } from 'lucide-react'
import type { Branding, BrandingImage, BrandingProps, BrandingTab as Tab, FontSize, ImageKind, ThemeChoice } from '@/../product/sections/branding/types'
import type { ContrastPair } from './helpers'
import { FONT_SIZES, btnGhost, btnPrimary, btnSecondary, checkPrimaryPairs, checkTextPairs, darkVariant, displayValue, fixLightness, fixTextColor, fmtDate, focusRing, fontStack, foregroundFor, inputClass, labelClass, primaryPasses, relativeTime, rovingNext, textPasses } from './helpers'
import { Card, ConfirmDialog, HelpNote, Pill, ScanPill } from './ui'
import { EmailPreview, FooterPreview, ImagePlaceholder, LocalePreview, ShellPreview, SignInPreview } from './previews'

const TABS: Array<{ id: Tab; label: string; caption: string }> = [
  { id: 'identity', label: 'Identity', caption: 'Shell with your name and mark' },
  { id: 'colors', label: 'Colors', caption: 'Shell with your primary color and theme' },
  { id: 'typography', label: 'Typography', caption: 'Shell with your font, size, and text color' },
  { id: 'signin', label: 'Sign-in', caption: 'The sign-in card members see' },
  { id: 'email', label: 'Email', caption: 'The real invitation template' },
  { id: 'links', label: 'Links', caption: 'The shell footer' },
  { id: 'locale', label: 'Locale', caption: 'Formatted samples' },
]

/** Human labels for the changed-field list, grouped by tab. */
const FIELD_LABELS: Record<keyof Branding, [Tab, string]> = {
  companyName: ['identity', 'Company name'], productName: ['identity', 'Product display name'], logoLightImageId: ['identity', 'Logo for light backgrounds'], logoDarkImageId: ['identity', 'Logo for dark backgrounds'], logoMarkImageId: ['identity', 'Square mark'], faviconImageId: ['identity', 'Favicon'],
  primaryColor: ['colors', 'Primary color'], defaultTheme: ['colors', 'Default theme'],
  fontFamily: ['typography', 'Font'], fontSize: ['typography', 'Font size'], textColor: ['typography', 'Text color'],
  loginBackgroundImageId: ['signin', 'Background image'], loginBackgroundColor: ['signin', 'Background color'], loginWelcomeText: ['signin', 'Welcome text'], loginNoticeText: ['signin', 'System-use notice'], loginNoticeRequiresAcknowledgement: ['signin', 'Acknowledgement required'],
  emailSenderName: ['email', 'Sender display name'], emailReplyTo: ['email', 'Reply-to address'], emailFooterText: ['email', 'Footer text'],
  supportUrl: ['links', 'Support URL'], supportEmail: ['links', 'Support email'], termsUrl: ['links', 'Terms of use URL'], privacyUrl: ['links', 'Privacy policy URL'],
  defaultLocale: ['locale', 'Default language'], defaultTimeZone: ['locale', 'Time zone'], dateFormat: ['locale', 'Date format'], numberFormat: ['locale', 'Number format'],
}
/** Edge fade cues for the tab strip. Written as whole literals so Tailwind can see them. */
const MASK_START = '[mask-image:linear-gradient(to_right,transparent,black_24px)]'
const MASK_END = '[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]'
const MASK_BOTH = '[mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]'

const TAB_TITLE: Record<Tab, string> = { identity: 'Identity', colors: 'Colors and theme', typography: 'Typography', signin: 'Sign-in page', email: 'Email', links: 'Links', locale: 'Locale' }
const TAB_FIELDS: Record<Tab, string[]> = {
  identity: ['companyName', 'productName', 'logoLightImageId', 'logoDarkImageId', 'logoMarkImageId', 'faviconImageId'],
  colors: ['primaryColor', 'defaultTheme'],
  typography: ['fontFamily', 'fontSize', 'textColor'],
  signin: ['loginWelcomeText', 'loginNoticeText', 'loginNoticeRequiresAcknowledgement', 'loginBackgroundColor', 'loginBackgroundImageId'],
  email: ['emailSenderName', 'emailReplyTo', 'emailFooterText'],
  links: ['supportUrl', 'supportEmail', 'termsUrl', 'privacyUrl'],
  locale: ['defaultLocale', 'defaultTimeZone', 'dateFormat', 'numberFormat'],
}

/** The changed fields as human labels grouped by tab. Publish and Discard both show this list, so both name the same set. */
function ChangedFields({ fields }: { fields: Array<keyof Branding> }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {(Object.keys(TAB_TITLE) as Tab[]).map((t) => {
        const labels = fields.filter((k) => FIELD_LABELS[k][0] === t).map((k) => FIELD_LABELS[k][1])
        return labels.length ? <li key={t}><span className="font-semibold">{TAB_TITLE[t]}:</span> <span className="text-gray-700 dark:text-gray-300">{labels.join(', ')}</span></li> : null
      })}
    </ul>
  )
}

function Field({ label, hint, changed, children, htmlFor }: { label: string; hint?: string; changed?: boolean; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={`${labelClass} flex items-center gap-1.5`}>{label}{changed ? <span aria-label="Changed" className="size-1.5 rounded-full bg-blue-600" /> : null}</label>
      {children}
      {hint ? <span className="text-xs text-gray-600 dark:text-gray-400">{hint}</span> : null}
    </div>
  )
}

/** A segmented radio group. One tab stop, then the arrows and Home and End move the selection and the focus together. */
function RadioRow<T extends string>({ label, value, options, onChange, title, compact }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; title?: (v: T) => string; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = rovingNext(e.key, options.indexOf(value), options.length)
    if (n < 0) return
    e.preventDefault()
    onChange(options[n])
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[n]?.focus()
  }
  return (
    <div ref={ref} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex h-10 w-fit items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} tabIndex={value === o ? 0 : -1} title={title?.(o)} onClick={() => onChange(o)} className={`h-8 rounded-lg font-medium capitalize ${compact ? 'px-2.5 text-xs' : 'px-3.5 text-sm'} ${focusRing} ${value === o ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>{o}</button>
      ))}
    </div>
  )
}

function SelectField({ id, value, onChange, children, className = '' }: { id: string; value: string; onChange: (v: string) => void; children: React.ReactNode; className?: string }) {
  return (
    <span className="relative block">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} appearance-none pr-10 ${className}`}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" strokeWidth={2} aria-hidden />
    </span>
  )
}

/**
 * The square kinds at the sizes the browser tab and the shell actually paint them. One frame, one center
 * line, one label baseline: the sizes read as a scale instead of a staircase, and it replaces the single
 * large tile rather than repeating it.
 */
function SizeStrip({ image, sizes }: { image: BrandingImage; sizes: number[] }) {
  const max = Math.max(...sizes)
  return (
    <div className="flex shrink-0 items-center gap-4 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 dark:border-gray-700 dark:bg-gray-950">
      {sizes.map((s) => (
        <span key={s} className="flex flex-col items-center gap-1.5">
          <span className="flex items-center justify-center" style={{ height: max }}>
            <span className="overflow-hidden rounded-sm" style={{ width: s, height: s }}>
              {image.url ? <img src={image.url} alt="" width={s} height={s} className="size-full object-contain" /> : <ImagePlaceholder size={s} />}
            </span>
          </span>
          <span className="text-[11px] font-medium leading-none tabular-nums text-gray-500 dark:text-gray-400">{s}<span className="sr-only"> pixels</span></span>
        </span>
      ))}
    </div>
  )
}

/** One image slot: empty drop zone, the uploading progress bar, the refusal notice, or the stored image. */
function DropZone({ kind, label, image, recommended, types, maxBytes, changed, upload, onUpload, onRemove, onDismissRefusal, sizes }: { kind: ImageKind; label: string; image: BrandingImage | null; recommended: string; types: string[]; maxBytes: number; changed?: boolean; upload?: { state: 'uploading' | 'infected'; fileName: string }; onUpload: (file: File) => void; onRemove: () => void; onDismissRefusal: () => void; sizes?: number[] }) {
  const [over, setOver] = useState(false)
  const ext = types.map((t) => t.split('/')[1].replace('svg+xml', 'svg').replace('x-icon', 'ico')).join(', ').toUpperCase()
  const id = `dz-${kind}`
  if (upload?.state === 'uploading') {
    return (
      <Field label={label} changed={changed}>
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3.5 dark:border-gray-800">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium">{upload.fileName}</span>
            <Pill tone="gray"><RefreshCw className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden />Uploading</Pill>
          </div>
          <div role="progressbar" aria-label={`Uploading ${upload.fileName}`} className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div className="h-full w-1/3 rounded-full bg-blue-600 motion-safe:animate-pulse" />
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400">Uploading through Genie. The malware scan starts when the upload finishes.</span>
        </div>
      </Field>
    )
  }
  if (upload?.state === 'infected') {
    return (
      <Field label={label} changed={changed}>
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3.5 dark:border-red-900 dark:bg-red-950/40">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 font-medium text-red-800 dark:text-red-200"><AlertTriangle className="size-4 shrink-0" strokeWidth={2} aria-hidden /><span className="truncate">{upload.fileName}</span></span>
            <Pill tone="red">Infected</Pill>
          </div>
          <p className="text-sm text-red-800 dark:text-red-200">This file was refused by the malware scan.</p>
          <p className="text-xs text-red-700 dark:text-red-300">Nothing was saved and the slot is unchanged. Upload a different file.</p>
          <div className="flex flex-wrap gap-2">
            <label className={`${btnSecondary} h-11 cursor-pointer justify-center sm:h-10`}><CloudUpload className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Choose another file<input id={id} type="file" accept={types.join(',')} className="sr-only" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /></label>
            <button type="button" className={`${btnGhost} h-11 sm:h-10`} onClick={onDismissRefusal}>Dismiss</button>
          </div>
        </div>
      </Field>
    )
  }
  return (
    <Field label={label} changed={changed} htmlFor={id}>
      {image ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          {sizes ? (
            <SizeStrip image={image} sizes={sizes} />
          ) : (
            <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 ${kind === 'logoDark' ? 'bg-gray-900' : 'bg-white'} dark:border-gray-700`} style={{ width: 156, height: 56 }}>
              {image.url ? <img src={image.url} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlaceholder size={20} />}
            </span>
          )}
          <div className="min-w-[160px] flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium"><span className="break-all">{image.fileName}</span><ScanPill status={image.scanStatus} /></div>
            <div className="text-xs text-gray-600 dark:text-gray-400">{image.width} × {image.height} px · {(image.sizeBytes / 1024).toFixed(0)} KB · {relativeTime(image.uploadedAt)}</div>
            {image.scanStatus === 'pending' ? <div className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">Not shown to members until the scan finishes.</div> : null}
          </div>
          <div className="flex w-full shrink-0 gap-2 sm:w-auto sm:flex-col sm:gap-1">
            <label className={`${btnSecondary} h-11 flex-1 cursor-pointer justify-center sm:h-8 sm:flex-none`}><RefreshCw className="size-5 text-gray-500 sm:size-4" strokeWidth={1.75} aria-hidden />Replace<input id={id} type="file" accept={types.join(',')} className="sr-only" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} /></label>
            <button type="button" className={`${btnGhost} h-11 flex-1 justify-center text-gray-600 sm:h-8 sm:flex-none`} onClick={onRemove}><Trash2 className="size-5 sm:size-4" strokeWidth={1.75} aria-hidden />Remove</button>
          </div>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onUpload(f) }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center motion-safe:transition-colors focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 ${over ? 'border-blue-500 bg-gray-50' : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900'}`}
        >
          <CloudUpload className="size-5 text-gray-500" strokeWidth={1.5} aria-hidden />
          <span className="text-sm font-medium">Drop an image or <span className="text-blue-700 dark:text-blue-400">browse</span></span>
          <span className="text-xs text-gray-600 dark:text-gray-400">{ext} · up to {Math.round(maxBytes / 1048576)} MB · {recommended}</span>
          <span className="text-xs text-gray-500">Uploads through Genie with a progress bar. SVG, PNG, JPEG, and WebP are accepted by type; the scan status stays Skipped until a scanner exists.</span>
          <input id={id} type="file" accept={types.join(',')} className="sr-only" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      )}
    </Field>
  )
}

/** Keyed `<theme> <label>`, matching the pairs `checkPrimaryPairs` and `checkTextPairs` return. */
const PAIR_TITLES: Record<string, string> = {
  'light Fill': 'The primary fill under its computed text, on the light surface',
  'dark Fill': 'The same fill and text in the dark theme; a solid fill keeps the raw color',
  'light Text on nav': 'The color as text on the white active navigation pill',
  'dark Text on nav': 'The lifted shade as text on the gray-900 active navigation pill',
  'light Count pill': 'White text on the primary count pill',
  'light Focus ring': 'The ring against white and gray-50, at 3:1 (WCAG 1.4.11)',
  'light On surface': 'The text color on the white surface',
  'light On subtle surface': 'The text color on the gray-50 subtle surface',
}

const THEME_GROUPS = [{ theme: 'light', label: 'Light theme' }, { theme: 'dark', label: 'Dark theme' }] as const

/** One specimen of the color in the role the theme gives it, with the hex the shell actually paints. */
function Specimen({ caption, label, hex, style, className }: { caption: string; label: string; hex: string; style: React.CSSProperties; className: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{caption}</span>
      <span className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 ${className}`} style={style}>
        <span className="text-sm font-bold" aria-hidden>Aa</span>
        <span className="sr-only">{label}</span>
        <code className="font-mono text-xs">{hex}</code>
      </span>
    </div>
  )
}

/**
 * The contrast report under a color control: the pass or fail summary with the Fix action, then one
 * row per pair grouped by theme. A group with no pairs is dropped, so a light-only check shows one column.
 */
function ContrastReport({ pairs, onFix }: { pairs: ContrastPair[]; onFix: () => void }) {
  const failed = pairs.filter((x) => !x.ok).length
  // Typography checks the light theme alone. A two-column grid would leave the right half empty, so one group means one column.
  const groups = THEME_GROUPS.filter((g) => pairs.some((x) => x.theme === g.theme))
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 pt-3.5 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Contrast</span>
        {failed === 0 ? (
          <Pill tone="emerald"><Check className="size-4" strokeWidth={2.5} aria-hidden />All {pairs.length} pairs pass</Pill>
        ) : (
          <div className="flex items-center gap-2">
            <Pill tone="red"><AlertTriangle className="size-4" strokeWidth={2} aria-hidden />{failed} of {pairs.length} pairs fail</Pill>
            <button type="button" className={`${btnSecondary} h-8 px-2 text-xs`} onClick={onFix}><Wand2 className="size-4 text-gray-500" strokeWidth={2} aria-hidden />Fix</button>
          </div>
        )}
      </div>
      <div className={`grid grid-cols-1 gap-x-8 gap-y-4 ${groups.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {groups.map((g) => {
          const rows = pairs.filter((x) => x.theme === g.theme)
          return rows.length ? (
            <div key={g.theme}>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">{g.label}</h4>
              <dl className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((x) => (
                  <div key={x.label} className="flex items-center gap-2 py-1.5" title={PAIR_TITLES[`${g.theme} ${x.label}`]}>
                    {x.ok ? <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden /> : <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" strokeWidth={2} aria-hidden />}
                    <dt className="text-sm text-gray-700 dark:text-gray-300">{x.label}</dt>
                    <dd className={`ml-auto font-mono text-sm tabular-nums ${x.ok ? 'text-gray-800 dark:text-gray-200' : 'font-semibold text-red-700 dark:text-red-400'}`}>
                      {x.ratio.toFixed(1)}<span className="font-normal text-gray-500 dark:text-gray-400"> / {x.target.toFixed(1)}</span>
                      <span className="sr-only"> to 1 against a {x.target} to 1 target, {x.ok ? 'passes' : 'fails'}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

function ColorRow({ label, value, changed, targets, onChange, onFix }: { label: string; value: string; changed?: boolean; targets: BrandingProps['contrastTargets']; onChange: (v: string) => void; onFix: () => void }) {
  const fg = foregroundFor(value)
  const dark = darkVariant(value)
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      {/* The decision leads: the swatch, then the two shades the shell derives from it. The report below is its consequence. */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <span className={`${labelClass} flex items-center gap-1.5`}>{label}{changed ? <span aria-label="Changed" className="size-1.5 rounded-full bg-blue-600" /> : null}</span>
          <label className="flex w-fit items-center gap-2 rounded-lg border border-gray-500 bg-white p-1 pr-2.5 focus-within:ring-2 focus-within:ring-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400">
            <input type="color" aria-label={`${label} color`} value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0" />
            <input value={value} onChange={(e) => onChange(e.target.value)} className="w-[8ch] bg-transparent font-mono text-sm outline-none" aria-label={`${label} hex`} />
          </label>
        </div>
        {/* The two specimens are one pair: they wrap together on a phone instead of splitting across lines. */}
        <div className="flex gap-4 sm:gap-8">
          <Specimen caption="Fill and its text" label={`Text ${fg} on ${value}`} hex={fg} className="border-gray-200 dark:border-gray-800" style={{ backgroundColor: value, color: fg }} />
          <Specimen caption="Text in dark theme" label={`Text ${dark} on the dark surface`} hex={dark} className="border-gray-700 bg-gray-950" style={{ color: dark }} />
        </div>
      </div>

      <ContrastReport pairs={checkPrimaryPairs(value, targets)} onFix={onFix} />
    </div>
  )
}

export function BrandingPage(p: BrandingProps) {
  const [tab, setTab] = useState<Tab>(p.initialTab ?? 'identity')
  const [draft, setDraft] = useState<Branding>({ ...p.branding, ...p.initialDraft })
  const [images, setImages] = useState<BrandingImage[]>(p.images)
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>(p.initialPreviewTheme ?? 'light')
  const [showPreview, setShowPreview] = useState(false)
  const [dialog, setDialog] = useState<'publish' | 'discard' | 'previous' | null>(p.initialDialog ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const [strip, setStrip] = useState<HTMLDivElement | null>(null)
  const [cue, setCue] = useState({ start: false, end: false })
  const [publishing, setPublishing] = useState(false)
  const [uploads, setUploads] = useState<Partial<Record<ImageKind, { state: 'uploading' | 'infected'; fileName: string }>>>(
    p.initialUpload ? { logoDark: { state: p.initialUpload, fileName: 'meridian-logo-dark.svg' } } : {},
  )

  const changed = useMemo(() => (Object.keys(draft) as Array<keyof Branding>).filter((k) => draft[k] !== p.branding[k]), [draft, p.branding])
  const dirty = changed.length > 0
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const img = (id: string | null) => images.find((i) => i.id === id) ?? null

  const colorFails = !primaryPasses(draft.primaryColor, p.contrastTargets) || !textPasses(draft.textColor, p.contrastTargets.light)

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  /** The tab strip fades only on the side that still has tabs off-screen, at every width. */
  useEffect(() => {
    if (!strip) return
    const update = () => setCue({ start: strip.scrollLeft > 1, end: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1 })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(strip)
    strip.addEventListener('scroll', update, { passive: true })
    return () => { ro.disconnect(); strip.removeEventListener('scroll', update) }
  }, [strip])

  /** Upload, then scan: the slot shows a progress bar, then the image with a Scanning pill. A refused file never reaches the slot. */
  const upload = (kind: ImageKind, file: File) => {
    setUploads((u) => ({ ...u, [kind]: { state: 'uploading', fileName: file.name } }))
    void p.onUploadImage?.(kind, file)
    setTimeout(() => {
      const id = `img_${Date.now()}`
      setImages((l) => [...l, { id, kind, fileName: file.name, mimeType: file.type, sizeBytes: file.size, width: 0, height: 0, url: null, scanStatus: 'pending', uploadedAt: new Date().toISOString() }])
      set(`${kind}ImageId` as keyof Branding, id as never)
      setUploads((u) => ({ ...u, [kind]: undefined }))
    }, 1200)
  }
  const remove = (kind: ImageKind) => { set(`${kind}ImageId` as keyof Branding, null as never); p.onRemoveImage?.(kind) }
  const fix = (k: 'primaryColor' | 'textColor') => {
    const fallback = k === 'primaryColor' ? fixLightness(draft[k], p.contrastTargets) : fixTextColor(draft[k], p.contrastTargets.light)
    set(k, p.onSuggestFix?.(k, draft[k]) ?? fallback)
  }
  const discard = () => { setDraft(p.branding); setImages(p.images); setUploads({}); p.onDiscard?.(); setDialog(null) }
  /** Restore writes the previous values into the draft only. The admin still reviews them and presses Publish. */
  const previousValues = p.lastPublish?.previousValues
  const restorable = p.lastPublish?.changedFields.filter((k) => previousValues && k in previousValues) ?? []
  const restore = () => {
    if (!previousValues || !restorable.length) return
    setDraft((d) => ({ ...d, ...previousValues }))
    setDialog(null)
    setToast('Restored to the draft. Publish to apply.')
  }
  /** Design only: the loading state holds for 900 ms before the publish lands. */
  const publish = () => {
    if (publishing) return
    setPublishing(true)
    setTimeout(() => { p.onPublish?.(draft, changed); setPublishing(false); setDialog(null); setToast('Published') }, 900)
  }

  const active = TABS.find((t) => t.id === tab)!
  const stripMask = cue.start ? (cue.end ? MASK_BOTH : MASK_START) : cue.end ? MASK_END : ''
  const publishBlocked = !dirty || colorFails
  const mark = img(draft.logoMarkImageId)
  /** The tab that owns the failing check, so the block reason can point at it. */
  const failingTab: Tab | null = !primaryPasses(draft.primaryColor, p.contrastTargets) ? 'colors' : !textPasses(draft.textColor, p.contrastTargets.light) ? 'typography' : null

  const goToTab = (id: Tab) => {
    setTab(id)
    const el = strip?.querySelector<HTMLButtonElement>(`#branding-tab-${id}`)
    el?.focus()
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = rovingNext(e.key, TABS.findIndex((t) => t.id === tab), TABS.length, true)
    if (n < 0) return
    e.preventDefault()
    goToTab(TABS[n].id)
  }

  /** Why Publish refuses. The contrast case is read on the page and names the tab that holds the control. */
  const blockNote = (id: string, extra = '') => {
    if (!publishBlocked) return null
    if (!colorFails) return <p id={id} className="sr-only">Nothing to publish. Change a setting first.</p>
    return (
      <p id={id} className={`text-xs text-amber-800 dark:text-amber-300 ${extra}`}>
        Publish is blocked: {failingTab === 'typography' ? 'the text color fails its contrast check' : 'the primary color fails a contrast check'}.{' '}
        <button type="button" onClick={() => goToTab(failingTab ?? 'colors')} className={`rounded-sm font-semibold underline underline-offset-2 ${focusRing}`}>Fix it on the {TAB_TITLE[failingTab ?? 'colors']} tab</button>
      </p>
    )
  }

  /** Publish keeps its place in the tab order while blocked, so the reason can be read from the button itself. */
  const actions = (reasonId: string) => (
    <>
      <button type="button" className={`${btnSecondary} flex-1 justify-center md:flex-none`} disabled={!dirty} onClick={() => setDialog('discard')}>Discard</button>
      <button type="button" className={`${btnPrimary} flex-1 justify-center md:flex-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none aria-disabled:hover:bg-blue-600 aria-disabled:active:bg-blue-600`} aria-disabled={publishBlocked || undefined} aria-describedby={publishBlocked ? reasonId : undefined} aria-busy={publishing || undefined} onClick={() => { if (publishBlocked || publishing) return; setDialog('publish') }}>{publishing ? <Loader2 className="size-5 motion-safe:animate-spin" strokeWidth={2} aria-hidden /> : null}Publish</button>
    </>
  )

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Header bar: draft state and actions. On phones the actions move to the sticky bottom bar. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="status" className="flex items-center">
          {dirty ? (
          <Pill tone="gray"><span className="size-1.5 rounded-full bg-gray-500" />{changed.length} unpublished {changed.length === 1 ? 'change' : 'changes'}</Pill>
        ) : p.lastPublish ? (
          <Pill tone="gray" onClick={() => setDialog('previous')} label={`Published ${relativeTime(p.lastPublish.at)} by ${p.lastPublish.by}. Show the previous values.`}>
            Published {relativeTime(p.lastPublish.at)} by {p.lastPublish.by}
            <ChevronRight className="size-3.5 text-gray-500" strokeWidth={2.5} aria-hidden />
          </Pill>
        ) : (
          <Pill tone="gray">Not published yet</Pill>
        )}
        </div>
        <HelpNote label="How publishing works">
          <p>Your edits live in this browser as a draft. Nobody else sees them, and the preview shows the draft, not what members have now.</p>
          <p>Publish writes every changed field at once and records one audit event. Members see the new branding on their next page load.</p>
          <p className="text-gray-600 dark:text-gray-400">Discard drops the whole draft. The published pill opens what the last publish changed, and Restore puts those values back in the draft for you to publish.</p>
        </HelpNote>
        {blockNote('publish-block-desktop', 'hidden md:block')}
        <div className="ml-auto hidden items-center gap-2 md:flex">{actions('publish-block-desktop')}</div>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        <Card>
          <div ref={setStrip} role="tablist" aria-label="Branding settings" onKeyDown={onTabKeyDown} className={`flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200 px-2 dark:border-gray-800 ${stripMask}`}>
            {TABS.map((t) => {
              const tabChanged = changed.some((k) => TAB_FIELDS[t.id].includes(k))
              return (
                <button key={t.id} id={`branding-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={tab === t.id ? `branding-panel-${t.id}` : undefined} tabIndex={tab === t.id ? 0 : -1} onClick={(e) => { setTab(t.id); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest' }) }} className={`-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${focusRing} ${tab === t.id ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}`}>
                  {t.label}{tabChanged ? <span aria-label="Changed" className="size-1.5 rounded-full bg-blue-600" /> : null}
                </button>
              )
            })}
          </div>
          {/* Phone: the preview sits below the whole form, so its toggle rides up here next to the tabs it describes. */}
          <button type="button" aria-expanded={showPreview} aria-controls="branding-preview" onClick={() => setShowPreview((v) => !v)} className={`flex h-11 w-full items-center gap-2 border-b border-gray-200 px-5 text-left md:hidden dark:border-gray-800 ${focusRing}`}><span className="text-sm font-semibold">{showPreview ? 'Hide preview' : 'Show preview'}</span>{dirty ? <Pill tone="gray">Draft</Pill> : null}</button>
          <div role="tabpanel" id={`branding-panel-${tab}`} aria-labelledby={`branding-tab-${tab}`} className="flex flex-col gap-5 px-5 py-5 sm:px-6">
            {tab === 'identity' ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Company name" changed={changed.includes('companyName')} htmlFor="b-company"><input id="b-company" value={draft.companyName} onChange={(e) => set('companyName', e.target.value)} className={inputClass} /></Field>
                  <Field label="Product display name" changed={changed.includes('productName')} htmlFor="b-product" hint="Shown under the company name in the sidebar and on sign-in."><input id="b-product" value={draft.productName} onChange={(e) => set('productName', e.target.value)} className={inputClass} /></Field>
                </div>
                <DropZone kind="logoLight" label="Logo for light backgrounds" image={img(draft.logoLightImageId)} recommended={p.uploadPolicy.recommended.logoLight} types={p.uploadPolicy.imageTypes} maxBytes={p.uploadPolicy.maxBytes} changed={changed.includes('logoLightImageId')} upload={uploads.logoLight} onUpload={(f) => upload('logoLight', f)} onRemove={() => remove('logoLight')} onDismissRefusal={() => setUploads((u) => ({ ...u, logoLight: undefined }))} />
                <DropZone kind="logoDark" label="Logo for dark backgrounds" image={img(draft.logoDarkImageId)} recommended={p.uploadPolicy.recommended.logoDark} types={p.uploadPolicy.imageTypes} maxBytes={p.uploadPolicy.maxBytes} changed={changed.includes('logoDarkImageId')} upload={uploads.logoDark} onUpload={(f) => upload('logoDark', f)} onRemove={() => remove('logoDark')} onDismissRefusal={() => setUploads((u) => ({ ...u, logoDark: undefined }))} />
                <div className="grid grid-cols-1 gap-4">
                  <DropZone kind="logoMark" label="Square mark" image={img(draft.logoMarkImageId)} recommended={p.uploadPolicy.recommended.logoMark} types={p.uploadPolicy.imageTypes} maxBytes={p.uploadPolicy.maxBytes} changed={changed.includes('logoMarkImageId')} upload={uploads.logoMark} onUpload={(f) => upload('logoMark', f)} onRemove={() => remove('logoMark')} onDismissRefusal={() => setUploads((u) => ({ ...u, logoMark: undefined }))} sizes={[16, 32, 48]} />
                  <DropZone kind="favicon" label="Favicon" image={img(draft.faviconImageId)} recommended={p.uploadPolicy.recommended.favicon} types={p.uploadPolicy.faviconTypes} maxBytes={p.uploadPolicy.maxBytes} changed={changed.includes('faviconImageId')} upload={uploads.favicon} onUpload={(f) => upload('favicon', f)} onRemove={() => remove('favicon')} onDismissRefusal={() => setUploads((u) => ({ ...u, favicon: undefined }))} sizes={[16, 32, 48]} />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">When no square mark is set, the shell shows a letter tile with the first letter of the company name.</p>
              </>
            ) : null}

            {tab === 'colors' ? (
              <>
                {/* The note belongs to the card above it, so it sits inside one group and the panel gap separates the theme choice. */}
                <div className="flex flex-col gap-3">
                  <ColorRow label="Primary" value={draft.primaryColor} changed={changed.includes('primaryColor')} targets={p.contrastTargets} onChange={(v) => set('primaryColor', v)} onFix={() => fix('primaryColor')} />
                  <div className="flex max-w-[62ch] flex-col gap-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                    <p>One brand color. It fills primary buttons and count pills, colors the active navigation row's text, and fills the focus ring. The sidebar and page chrome stay neutral and no tint ramp is derived, so hover and press are the same color at 90% and 80% opacity.</p>
                    <p>One row per place the color renders: a color that passes as a fill can still fail as text. Fix keeps the hue and moves lightness until every pair passes. Publish is blocked while a pair fails.</p>
                  </div>
                </div>
                <Field label="Default theme" changed={changed.includes('defaultTheme')}>
                  <RadioRow label="Default theme" value={draft.defaultTheme} options={['light', 'dark', 'system'] as ThemeChoice[]} onChange={(v) => set('defaultTheme', v)} />
                </Field>
              </>
            ) : null}

            {tab === 'typography' ? (
              <>
                {/* Two decisions, each above the evidence for it. The panel gap separates them; no box is needed to say so. */}
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Font" changed={changed.includes('fontFamily')} htmlFor="b-font">
                      <SelectField id="b-font" value={draft.fontFamily} onChange={(v) => set('fontFamily', v)}>{p.approvedFonts.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</SelectField>
                    </Field>
                    <Field label="Font size" changed={changed.includes('fontSize')}>
                      <RadioRow label="Font size" value={draft.fontSize} options={Object.keys(FONT_SIZES) as FontSize[]} onChange={(v) => set('fontSize', v)} title={(v) => `${FONT_SIZES[v]} px`} />
                    </Field>
                  </div>
                  <span className="text-gray-800 dark:text-gray-200" style={{ fontFamily: fontStack(draft.fontFamily), fontSize: FONT_SIZES[draft.fontSize] }}>The quick brown fox jumps over 13 lazy dogs at {FONT_SIZES[draft.fontSize]} px. 0123456789</span>
                </div>
                {/* Same shape as the Colors tab: the decision leads, the contrast report below is its consequence. The one border
                    that stays carries information: the two cells have to read as a white surface and the gray-50 subtle surface. */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <span className={`${labelClass} flex items-center gap-1.5`}>Text color{changed.includes('textColor') ? <span aria-label="Changed" className="size-1.5 rounded-full bg-blue-600" /> : null}</span>
                    <label className="flex w-fit items-center gap-2 rounded-lg border border-gray-500 bg-white p-1 pr-2.5 focus-within:ring-2 focus-within:ring-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400">
                      <input type="color" aria-label="Text color" value={draft.textColor} onChange={(e) => set('textColor', e.target.value)} className="size-7 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                      <input value={draft.textColor} onChange={(e) => set('textColor', e.target.value)} className="w-[8ch] bg-transparent font-mono text-sm outline-none" aria-label="Text color hex" />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-gray-200 sm:grid-cols-2" style={{ fontFamily: fontStack(draft.fontFamily), fontSize: FONT_SIZES[draft.fontSize], color: draft.textColor }}>
                    {(['#ffffff', '#f9fafb'] as const).map((bg) => (
                      <div key={bg} className="flex flex-col gap-1 p-3.5" style={{ backgroundColor: bg }}>
                        <span className="font-bold" style={{ fontSize: '1.25em' }}>Claims Triage Assistant</span>
                        <span>Sorts incoming claims by urgency so the team opens the right one first.</span>
                        <span className="font-semibold uppercase tracking-wider" style={{ fontSize: '0.75em' }}>Workspace</span>
                      </div>
                    ))}
                  </div>
                  <ContrastReport pairs={checkTextPairs(draft.textColor, p.contrastTargets.light)} onFix={() => fix('textColor')} />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400">The font size preset sets the root size to 14, 15, or 16 px; headings and controls scale with it. The text color is used on light surfaces only and is checked against white and the gray-50 subtle surface at 4.5:1. The dark theme keeps its own gray-100 text. Fix keeps the hue. Publish is blocked while a check fails AA.</p>
              </>
            ) : null}

            {tab === 'signin' ? (
              <>
                <Field label="Welcome text" changed={changed.includes('loginWelcomeText')} htmlFor="b-welcome"><textarea id="b-welcome" rows={2} value={draft.loginWelcomeText} onChange={(e) => set('loginWelcomeText', e.target.value)} className={`${inputClass} h-auto py-2`} /></Field>
                <p className="text-xs text-gray-600 dark:text-gray-400">The support contact under the sign-in card comes from the Links tab.</p>
                <Field label="System-use notice" changed={changed.includes('loginNoticeText')} htmlFor="b-notice" hint="Leave empty to show no notice."><textarea id="b-notice" rows={4} value={draft.loginNoticeText ?? ''} onChange={(e) => set('loginNoticeText', e.target.value || null)} className={`${inputClass} h-auto py-2`} /></Field>
                <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-sm has-[:disabled]:cursor-not-allowed"><input type="checkbox" checked={draft.loginNoticeRequiresAcknowledgement} disabled={!draft.loginNoticeText} onChange={(e) => set('loginNoticeRequiresAcknowledgement', e.target.checked)} className={`size-4 rounded accent-blue-600 ${focusRing}`} />Require acknowledgement before sign-in{changed.includes('loginNoticeRequiresAcknowledgement') ? <span aria-label="Changed" className="size-1.5 rounded-full bg-blue-600" /> : null}</label>
                <Field label="Background color" changed={changed.includes('loginBackgroundColor')}>
                  <label className="flex w-fit items-center gap-2 rounded-lg border border-gray-500 bg-white p-1 pr-3 focus-within:ring-2 focus-within:ring-blue-500 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400"><input type="color" aria-label="Background color" value={draft.loginBackgroundColor} onChange={(e) => set('loginBackgroundColor', e.target.value)} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0" /><span className="font-mono text-sm">{draft.loginBackgroundColor}</span></label>
                </Field>
                <DropZone kind="loginBackground" label="Background image (optional)" image={img(draft.loginBackgroundImageId)} recommended={p.uploadPolicy.recommended.loginBackground} types={p.uploadPolicy.imageTypes} maxBytes={p.uploadPolicy.maxBytes} changed={changed.includes('loginBackgroundImageId')} upload={uploads.loginBackground} onUpload={(f) => upload('loginBackground', f)} onRemove={() => remove('loginBackground')} onDismissRefusal={() => setUploads((u) => ({ ...u, loginBackground: undefined }))} />
              </>
            ) : null}

            {tab === 'email' ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Sender display name" changed={changed.includes('emailSenderName')} htmlFor="b-sender" hint="The address is the deployment's own no-reply@genie.example."><input id="b-sender" value={draft.emailSenderName} onChange={(e) => set('emailSenderName', e.target.value)} className={inputClass} /></Field>
                  <Field label="Reply-to address" changed={changed.includes('emailReplyTo')} htmlFor="b-reply"><input id="b-reply" type="email" value={draft.emailReplyTo} onChange={(e) => set('emailReplyTo', e.target.value)} className={inputClass} /></Field>
                </div>
                <Field label="Footer text" changed={changed.includes('emailFooterText')} htmlFor="b-footer" hint="Legal entity, address, and why the person receives the email. Genie emails only."><textarea id="b-footer" rows={3} value={draft.emailFooterText} onChange={(e) => set('emailFooterText', e.target.value)} className={`${inputClass} h-auto py-2`} /></Field>
                <p className="rounded-lg bg-gray-50 px-3.5 py-3 text-xs text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">For a local-accounts tenant the sender name and reply-to also apply to the realm's SMTP settings. The credential emails (set password, reset password, verify email) are Keycloak's built-in templates and print the realm display name only. Nothing else from branding reaches them.</p>
              </>
            ) : null}

            {tab === 'links' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Support URL" changed={changed.includes('supportUrl')} htmlFor="b-support-url"><input id="b-support-url" type="url" placeholder="https://" value={draft.supportUrl ?? ''} onChange={(e) => set('supportUrl', e.target.value || null)} className={inputClass} /></Field>
                <Field label="Support email" changed={changed.includes('supportEmail')} htmlFor="b-support-email" hint="Shown on the sign-in page and in email footers."><input id="b-support-email" type="email" value={draft.supportEmail ?? ''} onChange={(e) => set('supportEmail', e.target.value || null)} className={inputClass} /></Field>
                <Field label="Terms of use URL" changed={changed.includes('termsUrl')} htmlFor="b-terms"><input id="b-terms" type="url" value={draft.termsUrl ?? ''} onChange={(e) => set('termsUrl', e.target.value || null)} className={inputClass} /></Field>
                <Field label="Privacy policy URL" changed={changed.includes('privacyUrl')} htmlFor="b-privacy"><input id="b-privacy" type="url" value={draft.privacyUrl ?? ''} onChange={(e) => set('privacyUrl', e.target.value || null)} className={inputClass} /></Field>
              </div>
            ) : null}

            {tab === 'locale' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Default language" changed={changed.includes('defaultLocale')} htmlFor="b-lang" hint={p.localeOptions.languages.length === 1 ? `${p.localeOptions.languages[0].label}. More languages when a customer requires them.` : undefined}>
                  <span className="relative block">
                    <select id="b-lang" disabled={p.localeOptions.languages.length === 1} value={draft.defaultLocale} onChange={(e) => set('defaultLocale', e.target.value)} className={`${inputClass} appearance-none pr-10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:bg-gray-900`}>{p.localeOptions.languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-gray-500" strokeWidth={2} aria-hidden />
                  </span>
                </Field>
                <Field label="Time zone" changed={changed.includes('defaultTimeZone')} htmlFor="b-tz"><SelectField id="b-tz" value={draft.defaultTimeZone} onChange={(v) => set('defaultTimeZone', v)}>{p.localeOptions.timeZones.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}</SelectField></Field>
                <Field label="Date format" changed={changed.includes('dateFormat')} htmlFor="b-date"><SelectField id="b-date" value={draft.dateFormat} onChange={(v) => set('dateFormat', v)} className="font-mono">{p.localeOptions.dateFormats.map((f) => <option key={f} value={f}>{f}</option>)}</SelectField></Field>
                <Field label="Number format" changed={changed.includes('numberFormat')} htmlFor="b-num"><SelectField id="b-num" value={draft.numberFormat} onChange={(v) => set('numberFormat', v)} className="font-mono">{p.localeOptions.numberFormats.map((f) => <option key={f} value={f}>{f}</option>)}</SelectField></Field>
              </div>
            ) : null}
          </div>
        </Card>

        <div id="branding-preview" className={`2xl:sticky 2xl:top-0 2xl:self-start ${showPreview ? '' : 'hidden md:block'}`}>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2"><span className="text-sm font-semibold">Preview</span>{dirty ? <Pill tone="gray">Draft</Pill> : null}<span className="text-xs text-gray-600 dark:text-gray-400">{active.caption}</span></div>
              <RadioRow label="Preview theme" value={previewTheme} options={['light', 'dark'] as const} onChange={setPreviewTheme} compact />
            </div>
            <div className="border-t border-gray-100 p-4 dark:border-gray-800">
              {tab === 'identity' || tab === 'colors' || tab === 'typography' ? <ShellPreview b={draft} mark={mark} theme={previewTheme} fontStack={fontStack(draft.fontFamily)} showContrast={tab === 'colors'} targets={p.contrastTargets} /> : null}
              {tab === 'signin' ? <SignInPreview b={draft} mark={mark} theme={previewTheme} fontStack={fontStack(draft.fontFamily)} /> : null}
              {tab === 'email' ? <EmailPreview b={draft} mark={mark} /> : null}
              {tab === 'links' ? <FooterPreview b={draft} theme={previewTheme} /> : null}
              {tab === 'locale' ? <LocalePreview b={draft} theme={previewTheme} /> : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Phone: the page's primary actions sit in a sticky bottom bar, the shell's bottomBar slot is not reachable from a section page. */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-1.5 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:hidden dark:border-gray-800 dark:bg-gray-950/95">
        {blockNote('publish-block-phone')}
        <div className="flex items-center gap-2">{actions('publish-block-phone')}</div>
      </div>

      <ConfirmDialog
        open={dialog === 'publish'}
        title={`Publish ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}?`}
        description="Members see the new branding on their next page load."
        confirmLabel="Publish"
        loading={publishing}
        onConfirm={publish}
        onClose={() => { if (!publishing) setDialog(null) }}
      >
        <ChangedFields fields={changed} />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'discard'}
        title={`Discard ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}?`}
        description="These changes are lost and cannot be recovered. Every tab returns to the published branding."
        confirmLabel="Discard"
        danger
        onConfirm={discard}
        onClose={() => setDialog(null)}
      >
        <ChangedFields fields={changed} />
      </ConfirmDialog>

      {p.lastPublish ? (
        <ConfirmDialog
          open={dialog === 'previous'}
          role="dialog"
          title="Previous published values"
          description={`${p.lastPublish.by} published ${p.lastPublish.changedFields.length} ${p.lastPublish.changedFields.length === 1 ? 'change' : 'changes'} on ${fmtDate(p.lastPublish.at)}.`}
          confirmLabel="Restore"
          cancelLabel="Close"
          confirmDisabled={!restorable.length}
          confirmTitle={restorable.length ? undefined : 'No previous values were recorded for these fields'}
          onConfirm={restore}
          onClose={() => setDialog(null)}
        >
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3 text-sm">
              {(Object.keys(TAB_TITLE) as Tab[]).map((t) => {
                const keys = p.lastPublish!.changedFields.filter((k) => FIELD_LABELS[k][0] === t)
                return keys.length ? (
                  <li key={t} className="flex flex-col gap-1.5">
                    <span className="font-semibold">{TAB_TITLE[t]}</span>
                    <ul className="flex flex-col gap-1.5">
                      {keys.map((k) => (
                        <li key={k} className="flex flex-col gap-0.5">
                          <span className="font-medium text-gray-800 dark:text-gray-200">{FIELD_LABELS[k][1]}</span>
                          <span className="flex flex-col gap-0.5 text-gray-600 dark:text-gray-400">
                            <span className="flex gap-2"><span className="w-14 shrink-0 text-gray-500">Before</span><span className="min-w-0">{displayValue(k, previousValues?.[k], images)}</span></span>
                            <span className="flex gap-2"><span className="w-14 shrink-0 text-gray-500">Now</span><span className="min-w-0">{displayValue(k, p.branding[k], images)}</span></span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : null
              })}
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-400">Restore puts the previous values back into the draft. Nothing changes for members until you press Publish.</p>
            <div className="flex items-start gap-2 rounded-lg bg-gray-50 px-3.5 py-3 dark:bg-gray-950/60">
              <Pill tone="gray">Simulated</Pill>
              <span className="text-xs text-gray-700 dark:text-gray-300">Genie records which fields changed, not what they held before. These previous values come from the sample fixture. Restore needs a platform read that does not exist yet.</span>
            </div>
          </div>
        </ConfirmDialog>
      ) : null}

      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-gray-200 bg-white py-2 pl-4 pr-2 text-sm font-medium shadow-lg md:left-auto md:right-6 md:translate-x-0 dark:border-gray-700 dark:bg-gray-900">
          <Check className="size-4 text-emerald-600" strokeWidth={2.5} aria-hidden />{toast}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className={`${btnGhost} size-8 justify-center px-0 text-gray-500`}><X className="size-5" strokeWidth={2} /></button>
        </div>
      ) : null}
    </div>
  )
}
