export type ThemeChoice = 'light' | 'dark' | 'system'

export interface TenantBranding {
  companyName: string
  productName: string
  logoLightUrl: string | null
  logoDarkUrl: string | null
  primaryColor: string
  defaultTheme: ThemeChoice
  loginBackgroundColor: string
  loginBackgroundUrl: string | null
  loginWelcomeText: string
  loginNoticeText: string | null
  loginNoticeRequiresAcknowledgement: boolean
  supportEmail: string | null
  supportUrl: string | null
  termsUrl: string | null
  privacyUrl: string | null
}

export type SignInStateId = 'default' | 'signed-out' | 'session-expired' | 'not-registered' | 'account-disabled'

export interface SignInBanner {
  /** neutral for informational states, warning for a refusal after the realm returned. */
  tone: 'neutral' | 'warning'
  /** For session-expired the component composes the text from sessionIdleMinutes; text here is the fallback. */
  text: string
}

export interface SignInTenantSettings {
  /** When true the realm holds local accounts: the button reads "Continue to sign in" and a forgot-password link points at the realm's reset flow. */
  localAccountsEnabled: boolean
  /** Idle timeout in minutes, from tenant settings. Used in the session-expired banner. */
  sessionIdleMinutes: number
  /** The realm's reset-credentials URL. Null when local accounts are off. */
  forgotPasswordUrl: string | null
}

export interface SignInState {
  id: SignInStateId
  banner: SignInBanner | null
}

export type BreakGlassStep = 'credentials' | 'authenticator-code' | 'change-password' | 'authenticator-enroll'

export interface PasswordPolicy {
  minLength: number
  rules: string[]
}

export interface AuthenticatorEnrollment {
  /** otpauth URI rendered as a QR code. */
  otpauthUri: string
  /** The same secret for manual entry, grouped in fours. */
  manualKey: string
  issuer: string
}

export interface BreakGlassAdmin {
  email: string
  /** First sign-in and after an operator rotation: forces a password change before the console. */
  mustChangePassword: boolean
  /** True until an authenticator app is enrolled. Enrollment follows the password change. */
  mustEnrollAuthenticator: boolean
  enrollment: AuthenticatorEnrollment
  /**
   * Minutes a visitor must wait after the per-deployment rate limit refuses a sign-in.
   * Every refusal is an audit event.
   */
  retryAfterMinutes: number
  errors: {
    credentials: string
    code: string
    notAdmin: string
  }
  passwordPolicy: PasswordPolicy
}

/** The `setup_step` names from `architecture/data-shape.md`, in order. The identity provider is not a step (DEC-36). */
export type SetupStepName = 'migrations' | 'seed' | 'realm' | 'clients' | 'roles' | 'admin_seed' | 'break_glass'

export interface SetupStep {
  step: SetupStepName
  state: 'pending' | 'done' | 'failed' | 'skipped'
  /** Set only when failed. */
  detail: string | null
  updatedAt: string
}

export interface SignInAndTenantPagesProps {
  branding: TenantBranding
  tenantSettings: SignInTenantSettings
  signInState: SignInState
  breakGlassAdmin: BreakGlassAdmin
  /** Break-glass door: which card is shown. The host decides after each callback resolves. */
  step: BreakGlassStep
  /** Break-glass door: inline error for the current step, or null. */
  error: string | null
  /** Break-glass door: the rate limit refused the last attempt. Inputs are disabled until retryAfterMinutes pass. */
  tooManyAttempts: boolean
  /** Not-set-up page: progress of `genie-ops setup`. Shown on every route until every step the running image knows is done. */
  setupSteps: SetupStep[]
  /** Limited-session page: which of the two conditions the account has cleared. */
  limitedSession: { passwordChanged: boolean; authenticatorEnrolled: boolean }
  /** Member presses "Continue with your company account". Sends them to the tenant realm. */
  onContinueWithCompanyAccount?: () => void
  /** Member ticks or unticks the system-use notice acknowledgement. */
  onAcknowledgeNotice?: (acknowledged: boolean) => void
  /** Break-glass step one: email and password submitted. */
  onSubmitCredentials?: (email: string, password: string) => void
  /** Break-glass step two: six-digit authenticator code submitted. */
  onSubmitAuthenticatorCode?: (code: string) => void
  /** Break-glass forced change: new password submitted. */
  onChangePassword?: (currentPassword: string, newPassword: string) => void
  /** Break-glass enrollment: the first code from the newly added authenticator app. */
  onConfirmEnrollment?: (code: string) => void
  /** "Use a different account" from the code step returns to step one. */
  onUseDifferentAccount?: () => void
  /** "Member sign-in" link under the break-glass card returns to the member sign-in page. */
  onGoToMemberSignIn?: () => void
  /** Limited-session page: "Continue setup" returns to the break-glass flow at the first unmet step. */
  onContinueSetup?: () => void
}
