export type SolutionStatus = 'draft' | 'ready' | 'maintenance' | 'down'
export type SolutionType = 'chat' | 'embedded'
export type MessageRole = 'user' | 'assistant'
export type AccessScope = 'solution' | 'tenant'
export type PrincipalType = 'user' | 'group'

export interface Viewer {
  id: string
  name: string
  /** Permission keys the person holds. There is no admin flag; `solutions:admin` unlocks the admin views, Draft badges, and Preview as member. */
  permissions: string[]
  grantedSolutionIds: string[]
}

/** The core `category` row (DEC-51). Managed on the admin portal's Categories page, not here; a solution references it by id, and a deleted category leaves the solution ungrouped. */
export interface Category {
  id: string
  name: string
  position: number
}

export interface ChatTheme {
  /** Stored themes only. The "Tenant branding" chip with id `default` is a client-side seed rendered from the branding values, never a row; sample data lists it for the preview. */
  id: string
  name: string
  /** Paints the square mark beside an assistant reply. The viewer has no colored header band. */
  headerColor: string
  headerForeground: string
  /** The reader's own turn is the only bubble in the transcript. An assistant reply is plain text and takes no theme color. */
  userBubbleColor: string
  userBubbleForeground: string
  /** Corner radius of the reader's own bubble. */
  radius: number
  font: string
  placeholder: string
}

export interface ApprovedFont {
  id: string
  label: string
}

export interface Solution {
  id: string
  slug: string
  name: string
  description: string
  type: SolutionType
  categoryId: string | null
  monogram: string
  accentColor: string
  status: SolutionStatus
  /** Short reason shown to members for maintenance and down, and to admins for draft. */
  statusReason: string | null
  /** Null means the chat renders with the tenant branding seed; no stored theme row and no default flag. */
  chatThemeId: string | null
  welcomeText: string
  starterPrompts: string[]
  externalBotId: string
  /** Chat only. Full HTTPS URL of the external chat API; public host only. */
  apiEndpoint: string
  /** Chat only, present on every chat row. Thumbs up and down on assistant replies. */
  feedbackEnabled?: boolean
  /** Embedded only. Public HTTPS URL shown in the sandboxed frame. */
  iframeUrl?: string
  /** Embedded only. Adds allow="fullscreen" and a Fullscreen control. */
  allowFullscreen?: boolean
  archived: boolean
  updatedAt: string
}

export interface Favorite {
  solutionId: string
  position: number
}

export interface Recent {
  solutionId: string
  openedAt: string
}

export interface Message {
  id: string
  role: MessageRole
  text: string
  at: string
  /** Assistant only. The bot's thinking, shown in a collapsible disclosure above the text. */
  reasoning?: string
  /** Assistant only. True when the stream ended without a finish signal. */
  interrupted?: boolean
  /** Assistant only. The member's vote when feedback is enabled. Ephemeral client state: a vote is an event plus an audit row, there is no feedback table, so it does not survive a reload. */
  feedback?: 'up' | 'down' | null
}

export interface Conversation {
  solutionId: string
  startedAt: string
  streaming: boolean
  /** True when the viewer reopened an existing bot-side conversation; earlier messages are not shown. */
  resumed?: boolean
  /** A safe error message after a failed send. Send is disabled until Retry or New chat. */
  error?: string | null
  messages: Message[]
}

export interface AccessGrant {
  id: string
  /** Null when the scope is the whole tenant. */
  solutionId: string | null
  roleName: string
  scope: AccessScope
  principalType: PrincipalType
  principalName: string
  memberCount: number | null
  via: string | null
  addedBy: string
}

export interface PersonSummary {
  id: string
  name: string
  email: string
  groupNames: string[]
}

export interface SolutionInput {
  name: string
  description: string
  /** Set at registration; never changes afterwards. */
  type: SolutionType
  categoryId: string | null
  monogram: string
  accentColor: string
  chatThemeId: string | null
  welcomeText: string
  starterPrompts: string[]
  externalBotId: string
  apiEndpoint: string
  feedbackEnabled: boolean
  /** Embedded only. */
  iframeUrl: string
  /** Embedded only. */
  allowFullscreen: boolean
}

export interface ChatThemeInput {
  name: string
  headerColor: string
  headerForeground: string
  userBubbleColor: string
  userBubbleForeground: string
  radius: number
  font: string
  placeholder: string
}

export interface ChatSolutionsProps {
  viewer: Viewer
  approvedFonts: ApprovedFont[]
  categories: Category[]
  chatThemes: ChatTheme[]
  solutions: Solution[]
  favorites: Favorite[]
  recents: Recent[]
  conversation: Conversation | null
  accessGrants: AccessGrant[]
  people: PersonSummary[]
  /** False when the deployment's GENIE_CHAT_API_ALLOWED_ORIGINS is empty: chat streaming is off and the register and configure screens say so (DEC-30). */
  chatEnabled: boolean
  /** Focus mode state, owned by the shell. */
  focused?: boolean
  /** Embedded only: load state of the frame. */
  frameState?: 'loading' | 'ready' | 'failed'
  /** Member opens a solution in the viewer. */
  onOpenSolution?: (solutionId: string) => void
  /** Member stars or unstars a solution. */
  onToggleFavorite?: (solutionId: string) => void
  /** Member reorders favorites on the Favorites page; positions follow the array order. */
  onReorderFavorites?: (orderedSolutionIds: string[]) => void
  /** Member sends a message. Blocked while one is in flight. */
  onSendMessage?: (solutionId: string, text: string) => void
  /** Member stops the current reply stream. */
  onStopStreaming?: (solutionId: string) => void
  /** Member starts a fresh conversation, discarding the current one. */
  onNewChat?: (solutionId: string) => void
  /** Administrator registers a solution with its type-specific connection: chat carries external bot id, API endpoint, and feedback; embedded carries the application URL and allow fullscreen. It starts as Draft. */
  onRegisterSolution?: (input: Pick<SolutionInput, 'name' | 'description' | 'categoryId' | 'type'> & Partial<Pick<SolutionInput, 'externalBotId' | 'apiEndpoint' | 'feedbackEnabled' | 'iframeUrl' | 'allowFullscreen'>>) => void
  /** Administrator saves one configure tab. Changing bot id or endpoint invalidates every member's session handle. */
  onUpdateSolution?: (solutionId: string, input: Partial<SolutionInput>) => void
  /** Administrator changes status, with a reason for maintenance and down. */
  onSetSolutionStatus?: (solutionId: string, status: SolutionStatus, reason: string | null) => void
  /** Administrator archives or restores a solution. */
  onArchiveSolution?: (solutionId: string, archived: boolean) => void
  /** Administrator duplicates a solution as a new Draft. */
  onDuplicateSolution?: (solutionId: string) => void
  /** Administrator permanently deletes an archived solution; cascades favorites, recents, and session handles. */
  onDeleteSolution?: (solutionId: string) => void
  /** Administrator opens any solution, including Draft, as a labeled preview; audited, never counted as access (DEC-27). */
  onPreview?: (solutionId: string) => void
  /** Embedded only: reload a frame that failed to load. */
  onReloadFrame?: (solutionId: string) => void
  /** Embedded only: request fullscreen when the solution allows it. */
  onFullscreen?: (solutionId: string) => void
  /** Member votes on an assistant reply when feedback is enabled. */
  onSendFeedback?: (solutionId: string, messageId: string, vote: 'up' | 'down') => void
  /** Member retries the last failed send. */
  onRetrySend?: (solutionId: string) => void
  /** Member toggles Focus mode (hides shell navigation). */
  onToggleFocus?: (focused: boolean) => void
  /**
   * Administrator opens central Access for this solution. Navigation only: the link carries the
   * module, the level, and the record, and core Access owns every assignment write (`DEC-39`).
   * There is no add or remove callback here, because a second write path would miss the shared
   * safeguards, the module gating, the audit entry, and the notifications.
   */
  onManageAccess?: (solutionId: string) => void
  /** Administrator creates a theme, starting from the tenant branding colors. */
  onCreateTheme?: (input: ChatThemeInput) => void
  /** Administrator saves a theme. */
  onUpdateTheme?: (themeId: string, input: ChatThemeInput) => void
  /** Administrator deletes a theme that no solution uses. */
  onDeleteTheme?: (themeId: string) => void
}
