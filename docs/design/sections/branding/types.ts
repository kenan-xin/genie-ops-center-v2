export type ThemeChoice = 'light' | 'dark' | 'system'
/** Platform enum. The UI labels `pending` as Scanning. */
export type ScanStatus = 'pending' | 'clean' | 'infected' | 'skipped'
export type ImageKind = 'logoLight' | 'logoDark' | 'logoMark' | 'favicon' | 'loginBackground'
export type BrandingTab = 'identity' | 'colors' | 'typography' | 'signin' | 'email' | 'links' | 'locale'
/** Root font size preset: compact 14px, default 15px, large 16px. Every rem-based control scales with it. */
export type FontSize = 'compact' | 'default' | 'large'

export interface Branding {
  companyName: string
  productName: string
  logoLightImageId: string | null
  logoDarkImageId: string | null
  logoMarkImageId: string | null
  faviconImageId: string | null
  /** The one tenant brand color. Fills shadcn `--primary` and `--primary-foreground`; sidebar and page chrome stay neutral. */
  primaryColor: string
  defaultTheme: ThemeChoice
  fontFamily: string
  fontSize: FontSize
  /** Heading and body text color on light surfaces; fills `--foreground`. Not applied in the dark theme, which keeps gray-100. */
  textColor: string
  loginBackgroundImageId: string | null
  loginBackgroundColor: string
  loginWelcomeText: string
  loginNoticeText: string | null
  loginNoticeRequiresAcknowledgement: boolean
  emailSenderName: string
  emailReplyTo: string
  emailFooterText: string
  supportUrl: string | null
  supportEmail: string | null
  termsUrl: string | null
  privacyUrl: string | null
  defaultLocale: string
  defaultTimeZone: string
  dateFormat: string
  numberFormat: string
}

export interface BrandingImage {
  id: string
  kind: ImageKind
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number
  height: number
  /** A tokenized download link issued by Genie. The design sample uses inline SVG data URIs. */
  url: string | null
  scanStatus: ScanStatus
  uploadedAt: string
}

export interface UploadPolicy {
  maxBytes: number
  imageTypes: string[]
  faviconTypes: string[]
  recommended: Record<ImageKind, string>
}

export interface ApprovedFont {
  id: string
  label: string
}

export interface LocaleOptions {
  languages: Array<{ code: string; label: string }>
  timeZones: string[]
  dateFormats: string[]
  numberFormats: string[]
}

export interface LastPublish {
  by: string
  at: string
  changedFields: Array<keyof Branding>
  /**
   * What each changed field held before that publish, for the Restore action on the published pill.
   * No platform read returns this yet: the branding row keeps only the current values and the audit
   * event names the fields, not their old values. The design runs it on the sample fixture and the
   * dialog says so. A field with no entry here is shown as not recorded and is not restored.
   */
  previousValues?: Partial<Branding>
}

export interface ContrastTargets {
  light: { surface: string; subtleSurface: string }
  dark: { surface: string; subtleSurface: string }
}

export interface BrandingProps {
  branding: Branding
  images: BrandingImage[]
  uploadPolicy: UploadPolicy
  approvedFonts: ApprovedFont[]
  localeOptions: LocaleOptions
  lastPublish: LastPublish | null
  contrastTargets: ContrastTargets
  /** Publish the whole draft in one transaction and write one audit event. Nothing is written to the Keycloak realm (DEC-40). */
  onPublish?: (draft: Branding, changedFields: Array<keyof Branding>) => void
  /** Drop the browser-side draft. */
  onDiscard?: () => void
  /** Upload an image for one slot through Genie in one request, with progress. Resolves to the new image id. */
  onUploadImage?: (kind: ImageKind, file: File) => Promise<string> | void
  /** Remove the image from one slot. The file stays in storage until cleanup. */
  onRemoveImage?: (kind: ImageKind) => void
  /** Ask for the nearest shade that passes AA: lightness first, saturation only when no lightness passes, hue kept. */
  onSuggestFix?: (field: 'primaryColor' | 'textColor', current: string) => string
  /** Design-only initial state, read from the preview URL. */
  initialTab?: BrandingTab
  initialDraft?: Partial<Branding>
  initialDialog?: 'publish' | 'discard' | 'previous'
  /** Design-only: the favicon slot mid-upload, or after the malware scan refused the file. */
  initialUpload?: 'uploading' | 'infected'
  initialPreviewTheme?: 'light' | 'dark'
}
