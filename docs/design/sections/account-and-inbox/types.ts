export type GroupSource = 'idp' | 'local'
export type ThemeChoice = 'light' | 'dark' | 'system'

export interface AccountUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  identitySource: string
  lastSyncedAt: string
  /** The tenant's break-glass account. Its account page shows Change password and Authenticator blocks and no Preferences or roles. */
  isBreakGlass?: boolean
}

export interface Group {
  id: string
  name: string
  source: GroupSource
}

export interface Session {
  id: string
  device: string
  browser: string
  /** The client address, shown instead of a geographic location. */
  ipAddress: string
  signedInAt: string
  lastActiveAt: string
  isCurrent: boolean
}

export interface LocaleOption {
  code: string
  label: string
}

export interface Preference {
  locale: string | null
  timeZone: string | null
  theme: ThemeChoice | null
  tenantDefaults: { locale: string; timeZone: string; theme: ThemeChoice }
  availableLocales: LocaleOption[]
  /** From the tenant's locale options. */
  availableTimeZones: string[]
}

export interface RoleGrant {
  id: string
  roleName: string
  moduleName: string
  permissionCount: number
  scopeType: string | null
  scopeLabel: string
  /** The group the grant came through, or null for a direct assignment. */
  via: string | null
}

export interface Notification {
  id: string
  kind: string
  title: string
  body: string
  link: string
  createdAt: string
  readAt: string | null
}

export interface IdleTimeout {
  idleMinutes: number
  warnAtSecondsLeft: number
  secondsLeft: number
  isWarning: boolean
}

export interface TenantSupport {
  companyName: string
  supportEmail: string | null
  supportUrl: string | null
  /** Local-account tenants only: the realm's account page where a person changes their password. Null for brokered tenants. */
  accountManagementUrl: string | null
  grantedBy: string
}

export interface EmptyStateCopy {
  heading: string
  body: string
}

export interface PasswordPolicy {
  minLength: number
  /** In display order. The last rule (provisioning password) is checked only when saving. */
  rules: string[]
}

export interface AccountAndInboxProps {
  user: AccountUser
  /** The tenant's break-glass account, shown when the viewer is that account. */
  breakGlassUser: AccountUser
  /** Break-glass only: the shared rule shown on the Change password block. */
  passwordPolicy: PasswordPolicy
  /** Break-glass only: when the current authenticator app was enrolled. */
  authenticatorEnrolledAt: string | null
  groups: Group[]
  sessions: Session[]
  preference: Preference
  roleGrants: RoleGrant[]
  notifications: Notification[]
  idleTimeout: IdleTimeout
  tenantSupport: TenantSupport
  emptyStates: { inbox: EmptyStateCopy; noSolutions: EmptyStateCopy }
  /** Sign out one non-current session. */
  onRevokeSession?: (sessionId: string) => void
  /** Sign out every session except the current one. */
  onRevokeOtherSessions?: () => void
  /** Save one preference. Pass null to return to the tenant default. */
  onChangePreference?: (key: 'locale' | 'timeZone' | 'theme', value: string | null) => void
  /** Open a notification: marks it read and follows its link. */
  onOpenNotification?: (notificationId: string) => void
  /** Mark every notification as read. */
  onMarkAllRead?: () => void
  /** Load the next page of notifications. */
  onLoadMoreNotifications?: () => void
  /** Idle modal: extend the session. */
  onStaySignedIn?: () => void
  /** Idle modal: end the session now. */
  onSignOutNow?: () => void
  /** Break-glass only: change the password. Current password required; the shared rule applies. */
  onChangeBreakGlassPassword?: (currentPassword: string, newPassword: string) => void
  /** Break-glass only: start authenticator re-enrollment. */
  onReenrollAuthenticator?: () => void
}
