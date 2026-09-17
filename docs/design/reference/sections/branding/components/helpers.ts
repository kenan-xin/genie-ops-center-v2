import type { Branding, BrandingImage, ContrastTargets, FontSize } from '@/../product/sections/branding/types'
import type { EmailTenant } from '@/../product/sections/email-templates/types'
import emailData from '@/../product/sections/email-templates/data.json'

/* Shared tokens for Branding. Email templates import the color and font helpers from here so both sections use one rule. */
export const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950'

export const btnPrimary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 motion-safe:transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none dark:disabled:bg-gray-800 dark:disabled:text-gray-500 ${focusRing}`
export const btnSecondary = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800 motion-safe:transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900 ${focusRing}`
export const btnDanger = `inline-flex h-10 items-center whitespace-nowrap gap-1.5 rounded-xl bg-red-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-red-600/20 motion-safe:transition-colors hover:bg-red-700 ${focusRing}`
export const btnGhost = `inline-flex h-8 items-center whitespace-nowrap gap-1.5 rounded-xl px-2 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${focusRing}`
export const inputClass = `h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 ${focusRing}`
export const labelClass = 'text-sm font-semibold text-gray-800 dark:text-gray-200'

/** The approved fonts: key stored in `tenant_branding.font_family`, label shown in the UI, stack used by the shell and the HTML emails. */
export const FONTS: Record<string, { label: string; stack: string }> = {
  'plus-jakarta-sans': { label: 'Plus Jakarta Sans', stack: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  'ibm-plex-sans': { label: 'IBM Plex Sans', stack: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  manrope: { label: 'Manrope', stack: 'Manrope, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
  'source-serif-4': { label: 'Source Serif 4', stack: '"Source Serif 4", Georgia, "Times New Roman", serif' },
}
/** What Keycloak credential emails use: no web font reaches the realm. */
export const SYSTEM_FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
export const fontLabel = (key: string) => FONTS[key]?.label ?? key
export const fontStack = (key: string) => FONTS[key]?.stack ?? SYSTEM_FONT_STACK
/** Root font size per preset. The type scale is rem-based, so everything follows. */
export const FONT_SIZES: Record<FontSize, number> = { compact: 14, default: 15, large: 16 }

const NOW = new Date('2026-09-16T09:45:00Z')

export function relativeTime(iso: string | null, now = NOW) {
  if (!iso) return 'Never'
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  return fmtDate(iso)
}

export function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })
}

/* Color math for branding: hex to HSL and back, tints, and the AA fix. */
export function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6
  return [h, s, l]
}

export function hslToHex(h: number, s: number, l: number) {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Five tints the shell derives from a brand color: background tint, hover tint, the color, hover, focus ring. */
export function tintStrip(hex: string) {
  const hsl = hexToHsl(hex)
  if (!hsl) return [hex, hex, hex, hex, hex]
  const [h, s, l] = hsl
  return [hslToHex(h, s, 0.95), hslToHex(h, s, 0.88), hex, hslToHex(h, s, Math.max(0.1, l - 0.08)), hslToHex(h, Math.min(1, s), Math.min(0.85, l + 0.25))]
}

/** The shade the shell uses for this brand color in the dark theme: same hue, lifted lightness. */
export function darkVariant(hex: string) {
  const hsl = hexToHsl(hex)
  if (!hsl) return hex
  const [h, s, l] = hsl
  return hslToHex(h, s, Math.min(0.85, Math.max(l, 0.62)))
}

export interface ContrastCheck { light: number; dark: number; ok: boolean }

/** Light: the raw color as text on the light surface and as a fill under its computed text. Dark: the dark variant as text on the dark surface. */
export function checkColor(hex: string, lightSurface: string, darkSurface: string, target = 4.5): ContrastCheck {
  const light = Math.min(contrastRatio(hex, lightSurface), contrastRatio(hex, foregroundFor(hex)))
  const dark = contrastRatio(darkVariant(hex), darkSurface)
  return { light, dark, ok: light >= target && dark >= target }
}

/** Text color on the two light surfaces. Dark is not checked: the dark theme keeps its fixed gray-100 text. */
export function checkTextColor(hex: string, light: ContrastTargets['light'], target = 4.5) {
  const surface = contrastRatio(hex, light.surface)
  const subtle = contrastRatio(hex, light.subtleSurface)
  return { surface, subtle, ok: surface >= target && subtle >= target }
}

/** Nearest shade that passes both checks. Moves lightness first; lowers saturation only when no lightness passes. The hue is always kept. */
export function fixLightness(hex: string, lightSurface: string, darkSurface: string, target = 4.5) {
  return nearestPassing(hex, (c) => checkColor(c, lightSurface, darkSurface, target).ok)
}

export function fixTextColor(hex: string, light: ContrastTargets['light'], target = 4.5) {
  return nearestPassing(hex, (c) => checkTextColor(c, light, target).ok)
}

function nearestPassing(hex: string, passes: (c: string) => boolean) {
  const hsl = hexToHsl(hex)
  if (!hsl) return hex
  const [h, s0, l0] = hsl
  for (const s of [s0, s0 * 0.85, s0 * 0.7, s0 * 0.55, s0 * 0.4]) {
    for (let step = 0; step <= 0.9; step += 0.01) {
      for (const l of [l0 - step, l0 + step]) {
        if (l < 0.05 || l > 0.95) continue
        const c = hslToHex(h, s, l)
        if (passes(c)) return c
      }
    }
  }
  return hex
}

function luminance(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const ch = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(n >> 16) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
}

/** The one foreground rule: white or near-black text for a hex background, by relative luminance. Stored as `primary_foreground` on save and never recomputed by an email. */
export function foregroundFor(hex: string) {
  return luminance(hex) > 0.4 ? '#111827' : '#ffffff'
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * The draft as the email templates see it, so the Email tab renders the real template with draft values.
 * The deployment values (public host, Keycloak base, realm, account type) come from the tenant's own row, not from branding.
 */
export function emailTenantFromDraft(b: Branding, mark: BrandingImage | null): EmailTenant {
  const tenant = (emailData.tenants as EmailTenant[])[0]
  const usable = mark && mark.scanStatus !== 'pending' && mark.scanStatus !== 'infected' ? mark.url : null
  return {
    ...tenant,
    id: 'draft',
    companyName: b.companyName,
    productName: b.productName,
    logoMarkUrl: usable,
    logoMarkText: b.companyName.slice(0, 1).toUpperCase(),
    primaryColor: b.primaryColor,
    primaryForeground: foregroundFor(b.primaryColor),
    fontFamily: b.fontFamily,
    emailSenderName: b.emailSenderName,
    emailReplyTo: b.emailReplyTo,
    emailFooterText: b.emailFooterText,
    supportEmail: b.supportEmail,
    supportUrl: b.supportUrl,
    termsUrl: b.termsUrl,
    privacyUrl: b.privacyUrl,
  }
}
