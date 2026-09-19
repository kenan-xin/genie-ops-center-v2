import { useId, useState } from 'react'
import { AlertTriangle, Archive, ArchiveRestore, Check, ExternalLink, Plus, Trash2, UsersRound, Building2 } from 'lucide-react'
import type { SolutionType } from '@/../product/sections/solutions/types'
import type { AccessGrant, Category, ChatTheme, Solution, SolutionInput, SolutionStatus } from '@/../product/sections/solutions/types'
import { btnGhost, btnPrimary, btnSecondary, contrastRatio, focusRing, foregroundFor, inputClass, isPublicHttps, labelClass } from './helpers'
import { Avatar, CloseButton, ConfirmDialog, Monogram, Pill, SaveButton, SlideOver, StatusPill, Tabs, WarningNote } from './ui'

type Tab = 'general' | 'chat' | 'connection' | 'status' | 'access'

export interface ConfigureSolutionSlideOverProps {
  solution: Solution | null
  /** Preview only: opens one tab straight away for screenshots. */
  initialTab?: string | null
  onClose: () => void
  categories: Category[]
  chatThemes: ChatTheme[]
  accessGrants: AccessGrant[]
  /** False when the deployment's GENIE_CHAT_API_ALLOWED_ORIGINS is empty: chat streaming is off (DEC-30). Defaults to true. */
  chatEnabled?: boolean
  onUpdateSolution?: (solutionId: string, input: Partial<SolutionInput>) => void
  onSetSolutionStatus?: (solutionId: string, status: SolutionStatus, reason: string | null) => void
  onArchiveSolution?: (solutionId: string, archived: boolean) => void
  /** Opens core Access with this solution preselected. This screen never writes an assignment (`DEC-39`). */
  onManageAccess?: (solutionId: string) => void
  onPreview?: (solutionId: string) => void
  /** Derived from the viewer's permissions (`solutions:admin`). Preview as member shows only when true. */
  canAdminister?: boolean
}

export function ChatDisabledNotice() {
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg bg-gray-100 px-3.5 py-3 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gray-500" strokeWidth={2} aria-hidden />
      <p>Chat solutions are not enabled on this deployment. Contact your Genie operator.</p>
    </div>
  )
}

/** `changed` adds the unsaved blue dot to the label; `count` renders a live counter against the limit. */
/**
 * The visible field label, the unsaved dot, and the character count. It draws the label; it does not
 * name the control, because a field can hold two controls or wrap them in a layout element. Every
 * control inside a Field carries its own `aria-label` (DESIGN.md, Inputs and Fields).
 */
function Field({ label, hint, children, changed, count }: { label: string; hint?: string; children: React.ReactNode; changed?: boolean; count?: [number, number] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`${labelClass} flex items-center justify-between gap-2`}>
        <span className="inline-flex items-center gap-1.5">{label}{changed ? <span aria-label="Unsaved" title="Unsaved" className="size-1.5 rounded-full bg-blue-600" /> : null}</span>
        {count ? <span className={`text-xs font-normal tabular-nums ${count[0] > count[1] ? 'text-red-700' : 'text-gray-500'}`}>{count[0]}/{count[1]}</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-gray-600 dark:text-gray-400">{hint}</span> : null}
    </div>
  )
}

function ContrastPill({ bg, fg }: { bg: string; fg: string }) {
  const r = contrastRatio(bg, fg)
  const ok = r >= 4.5
  return <Pill tone={ok ? 'emerald' : 'red'}>{ok ? <Check className="size-4" strokeWidth={2.5} aria-hidden /> : <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />}{r.toFixed(1)}:1 {ok ? 'AA' : 'fails AA'}</Pill>
}

function SaveBar({ dirty, canSave, onSave, onReset }: { dirty: boolean; canSave: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 dark:border-gray-800">
      <span className={`text-xs ${dirty ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'}`}>{dirty ? (canSave ? 'Unsaved changes' : 'Unsaved changes. Tick “I understand” to save.') : 'All changes saved'}</span>
      <div className="flex gap-2">
        <button type="button" className={btnSecondary} disabled={!dirty} onClick={onReset}>Discard</button>
        <SaveButton icon={<Check className="size-5" strokeWidth={2} aria-hidden />} disabled={!canSave} onClick={onSave}>Save</SaveButton>
      </div>
    </div>
  )
}

export function ConfigureSolutionSlideOver(p: ConfigureSolutionSlideOverProps) {
  const { solution: s } = p
  // Ties each field error to its control through `aria-describedby` (DESIGN.md, Inputs and Fields).
  const uid = useId()
  const [tab, setTab] = useState<Tab>((p.initialTab as Tab) ?? 'general')
  const [draft, setDraft] = useState<Partial<SolutionInput>>({})
  const [status, setStatus] = useState<SolutionStatus | null>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [confirmConn, setConfirmConn] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  if (!s) return null

  const v = { ...s, ...draft }
  const type: SolutionType = s.type
  const changed = (k: keyof SolutionInput) => draft[k] !== undefined
  const dirty = Object.keys(draft).length > 0
  const nameTooLong = (v.name ?? '').length > 80
  const descTooLong = (v.description ?? '').length > 500
  const promptTooLong = (v.starterPrompts ?? []).some((x) => x.length > 200)
  const iframeUrl = v.iframeUrl ?? ''
  const iframeValid = type !== 'embedded' || isPublicHttps(iframeUrl)
  const apiEndpoint = v.apiEndpoint ?? ''
  const endpointValid = type !== 'chat' || isPublicHttps(apiEndpoint)
  // Design stand-in for the operator allow-list check; the real app asks the server. The error names the origin, never the list.
  const originAllowed = !endpointValid || !apiEndpoint || /^https:\/\/[^/]*genie\.example/i.test(apiEndpoint)
  const invalid = nameTooLong || descTooLong || promptTooLong || !iframeValid || !endpointValid || !originAllowed
  const set = <K extends keyof SolutionInput>(k: K, val: SolutionInput[K]) => setDraft((d) => ({ ...d, [k]: val }))
  const reset = () => setDraft({})
  const save = () => { p.onUpdateSolution?.(s.id, draft); setDraft({}) }
  const connectionChanged = draft.externalBotId !== undefined || draft.apiEndpoint !== undefined
  const effStatus = status ?? s.status
  const effReason = reason ?? s.statusReason ?? ''
  const statusDirty = effStatus !== s.status || (effReason !== (s.statusReason ?? '') && (effStatus === 'maintenance' || effStatus === 'down'))
  const grants = p.accessGrants.filter((g) => g.solutionId === s.id || g.scope === 'tenant')
  const theme = p.chatThemes.find((t) => t.id === (v.chatThemeId ?? 'default')) ?? p.chatThemes.find((t) => t.id === 'default')

  return (
    <SlideOver open onClose={p.onClose} title={s.name}>
      <header className="flex items-start gap-3 px-5 pb-3 pt-5">
        <Monogram text={v.monogram} color={v.accentColor} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-bold tracking-tight">{v.name}</h2>
            <Pill>{type === 'embedded' ? 'Embedded' : 'Chat'}</Pill>
            <StatusPill status={s.status} />
            {s.archived ? <Pill>Archived</Pill> : null}
          </div>
          {p.canAdminister !== false ? (
            <button type="button" onClick={() => p.onPreview?.(s.id)} className={`mt-0.5 inline-flex items-center gap-1 rounded-md text-xs font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`}>
              Preview as member<ExternalLink className="size-4" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
        <CloseButton onClick={p.onClose} />
      </header>
      <Tabs
        tabs={[{ id: 'general' as Tab, label: 'General' }, ...(type === 'chat' ? [{ id: 'chat' as Tab, label: 'Chat' }] : []), { id: 'connection' as Tab, label: 'Connection' }, { id: 'status' as Tab, label: 'Status' }, { id: 'access' as Tab, label: 'Access', count: grants.length }]}
        value={tab === 'chat' && type !== 'chat' ? 'general' : tab}
        onChange={setTab}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {tab === 'general' ? (
          <div className="flex flex-col gap-4">
            <Field label="Name" changed={changed('name')} count={[v.name.length, 80]} hint={nameTooLong ? undefined : 'The link slug was derived at registration and does not change.'}><input aria-label="Name" value={v.name} maxLength={80} onChange={(e) => set('name', e.target.value)} className={inputClass} aria-invalid={nameTooLong} aria-describedby={nameTooLong ? `${uid}-name-error` : undefined} />{nameTooLong ? <span id={`${uid}-name-error`} role="alert" className="text-xs text-red-700">Keep the name to 80 characters.</span> : null}</Field>
            <Field label="Description" changed={changed('description')} count={[v.description.length, 500]} hint={descTooLong ? undefined : 'Shown on the card and in the viewer header.'}><textarea aria-label="Description" value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} rows={2} className={`${inputClass} h-auto py-2`} aria-invalid={descTooLong} aria-describedby={descTooLong ? `${uid}-description-error` : undefined} />{descTooLong ? <span id={`${uid}-description-error`} role="alert" className="text-xs text-red-700">Keep the description to 500 characters.</span> : null}</Field>
            <Field label="Category" changed={changed('categoryId')}>
              <select aria-label="Category" value={v.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)} className={`${inputClass} appearance-none`}>
                <option value="">Other (no category)</option>
                {p.categories.slice().sort((a, b) => a.position - b.position).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <Field label="Monogram" changed={changed('monogram')} hint="One or two letters."><input aria-label="Monogram" value={v.monogram} maxLength={2} onChange={(e) => set('monogram', e.target.value.toUpperCase())} className={`${inputClass} font-mono uppercase`} /></Field>
              <Field label="Accent color" changed={changed('accentColor')}>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label="Accent color" value={v.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="size-10 cursor-pointer rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-700 dark:bg-gray-950" />
                  <input aria-label="Accent color hex value" value={v.accentColor} onChange={(e) => set('accentColor', e.target.value)} className={`${inputClass} font-mono`} />
                </div>
              </Field>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-3.5 py-3 dark:bg-gray-950/60">
              <Monogram text={v.monogram || '?'} color={v.accentColor} />
              <div className="text-sm"><div className="font-semibold">Tile preview</div><div className="text-xs text-gray-600 dark:text-gray-400">Text color is computed. Contrast <ContrastPill bg={v.accentColor} fg={foregroundFor(v.accentColor)} /></div></div>
            </div>
          </div>
        ) : null}

        {tab === 'chat' && type === 'chat' ? (
          <div className="flex flex-col gap-4">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span><span className="flex items-center gap-1.5 text-sm font-semibold">Feedback on replies{changed('feedbackEnabled') ? <span aria-label="Unsaved" className="size-1.5 rounded-full bg-blue-600" /> : null}</span><span className="block text-xs text-gray-600 dark:text-gray-400">Thumbs up and down on each assistant reply. Votes go to the audit log and the event bus; nothing is stored per message.</span></span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input type="checkbox" role="switch" aria-label="Feedback on replies" checked={Boolean(v.feedbackEnabled)} onChange={(e) => set('feedbackEnabled', e.target.checked)} className="peer sr-only" />
                <span className="h-6 w-11 rounded-full bg-gray-300 motion-safe:transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:bg-gray-700 dark:peer-focus-visible:ring-blue-400 dark:peer-focus-visible:ring-offset-gray-950" />
                <span className="absolute left-0.5 size-5 rounded-full bg-white shadow motion-safe:transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
            <Field label="Chat theme" changed={changed('chatThemeId')} hint="Themes are built under Chat themes. The default is the tenant branding.">
              <select aria-label="Chat theme" value={v.chatThemeId ?? ''} onChange={(e) => set('chatThemeId', e.target.value || null)} className={`${inputClass} appearance-none`}>
                {p.chatThemes.map((t) => <option key={t.id} value={t.id === 'default' ? '' : t.id}>{t.name}{t.id === 'default' ? ' (default)' : ''}</option>)}
              </select>
            </Field>
            {theme ? (
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                {[theme.headerColor, theme.userBubbleColor].map((c, i) => <span key={i} className="size-4 rounded-full border border-black/10" style={{ backgroundColor: c }} />)}
                radius {theme.radius}px · {theme.font}
              </div>
            ) : null}
            <Field label="Welcome message" changed={changed('welcomeText')} count={[v.welcomeText.length, 2000]} hint="Shown before the first message."><textarea aria-label="Welcome message" value={v.welcomeText} maxLength={2000} onChange={(e) => set('welcomeText', e.target.value)} rows={2} className={`${inputClass} h-auto py-2`} /></Field>
            <Field label="Starter prompts" changed={changed('starterPrompts')} hint={`${v.starterPrompts.length}/12 chips a member can tap to begin. Each at most 200 characters.`}>
              <div className="flex flex-col gap-2">
                {v.starterPrompts.map((sp, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      <input aria-label={`Starter prompt ${i + 1}`} value={sp} maxLength={200} onChange={(e) => set('starterPrompts', v.starterPrompts.map((x, j) => (j === i ? e.target.value : x)))} className={inputClass} aria-invalid={sp.length > 200} />
                      <button type="button" aria-label="Remove prompt" className={`${btnGhost} size-10 shrink-0 justify-center px-0 text-gray-500`} onClick={() => set('starterPrompts', v.starterPrompts.filter((_, j) => j !== i))}><Trash2 className="size-4" strokeWidth={1.75} /></button>
                    </div>
                    {sp.length > 200 ? <span role="alert" className="text-xs text-red-700">{sp.length}/200. Shorten this prompt.</span> : null}
                  </div>
                ))}
                {v.starterPrompts.length < 12 ? <button type="button" className={`${btnSecondary} w-fit`} onClick={() => set('starterPrompts', [...v.starterPrompts, ''])}><Plus className="size-5" strokeWidth={2} aria-hidden />Add prompt</button> : <span className="text-xs text-gray-500">Twelve is the most a solution can show.</span>}
              </div>
            </Field>
          </div>
        ) : null}

        {tab === 'connection' && type === 'embedded' ? (
          <div className="flex flex-col gap-4">
            <Field label="Application URL" changed={changed('iframeUrl')} hint="A public HTTPS address. Private, loopback, and plain HTTP addresses are refused. The app must allow being framed by this tenant's hostname.">
              <input aria-label="Application URL" value={iframeUrl} onChange={(e) => set('iframeUrl', e.target.value)} placeholder="https://app.example.com/portal" className={`${inputClass} font-mono`} aria-invalid={!iframeValid} aria-describedby={iframeValid ? undefined : `${uid}-iframe-error`} />
              {!iframeValid ? <span id={`${uid}-iframe-error`} role="alert" className="text-xs text-red-700">Enter a public https:// address.</span> : null}
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
              <span><span className="flex items-center gap-1.5 text-sm font-semibold">Allow fullscreen{changed('allowFullscreen') ? <span aria-label="Unsaved" className="size-1.5 rounded-full bg-blue-600" /> : null}</span><span className="block text-xs text-gray-600 dark:text-gray-400">Adds a Fullscreen control to the viewer header and allow="fullscreen" on the frame.</span></span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input type="checkbox" role="switch" aria-label="Allow fullscreen" checked={Boolean(v.allowFullscreen)} onChange={(e) => set('allowFullscreen', e.target.checked)} className="peer sr-only" />
                <span className="h-6 w-11 rounded-full bg-gray-300 motion-safe:transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 dark:bg-gray-700 dark:peer-focus-visible:ring-blue-400 dark:peer-focus-visible:ring-offset-gray-950" />
                <span className="absolute left-0.5 size-5 rounded-full bg-white shadow motion-safe:transition-transform peer-checked:translate-x-5" />
              </span>
            </label>
            <p className="rounded-lg bg-gray-50 px-3.5 py-3 text-xs text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">The frame runs with sandbox="allow-scripts allow-forms". No chat theme, welcome text, or starter prompts apply to an embedded solution.</p>
          </div>
        ) : null}

        {tab === 'connection' && type === 'chat' ? (
          <div className="flex flex-col gap-4">
            {p.chatEnabled === false ? <ChatDisabledNotice /> : null}
            <Field label="External bot id" changed={changed('externalBotId')} count={[v.externalBotId.length, 200]} hint="The Genie chat API bot this solution talks to."><input aria-label="External bot id" value={v.externalBotId} maxLength={200} onChange={(e) => set('externalBotId', e.target.value)} className={`${inputClass} font-mono`} /></Field>
            <Field label="API endpoint" changed={changed('apiEndpoint')} hint="The full HTTPS address of the external chat API. The deployment allows only known origins; private and loopback hosts are refused.">
              <input aria-label="API endpoint" value={apiEndpoint} onChange={(e) => set('apiEndpoint', e.target.value)} placeholder="https://chat.example.com/public-api/v2/workflow/chatbot/chats" className={`${inputClass} font-mono`} aria-invalid={!endpointValid} aria-describedby={endpointValid && originAllowed ? undefined : `${uid}-endpoint-error`} />
              {!endpointValid ? <span id={`${uid}-endpoint-error`} role="alert" className="text-xs text-red-700">Enter a public https:// address.</span> : !originAllowed ? <span id={`${uid}-endpoint-error`} role="alert" className="text-xs text-red-700">The origin {new URL(apiEndpoint).origin} is not allowed on this deployment.</span> : null}
            </Field>
            {connectionChanged ? (
              <WarningNote size="md">
                <div>
                  <p className="font-semibold">Every member's current conversation restarts.</p>
                  <p className="mt-0.5">Changing the bot id or endpoint invalidates the stored session handles. Members keep access, but their open conversation with this solution is discarded.</p>
                  <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmConn} onChange={(e) => setConfirmConn(e.target.checked)} className={`size-4 rounded accent-blue-600 ${focusRing}`} />I understand</label>
                </div>
              </WarningNote>
            ) : null}
          </div>
        ) : null}

        {tab === 'status' ? (
          <div className="flex flex-col gap-4">
            <div role="radiogroup" aria-label="Status" className="flex flex-col gap-2">
              {([
                ['draft', 'Draft', 'Visible to administrators only. Preview it before members see it.'],
                ['ready', 'Ready', type === 'chat' ? 'Members can open it and chat.' : 'Members can open it.'],
                ['maintenance', 'Maintenance', type === 'chat' ? 'Members see your reason instead of the composer. Nothing is sent.' : 'Members see your reason instead of the application. Nothing is sent.'],
                ['down', 'Down', type === 'chat' ? 'Members see your reason instead of the composer. Nothing is sent.' : 'Members see your reason instead of the application. Nothing is sent.'],
              ] as Array<[SolutionStatus, string, string]>).map(([id, , help]) => (
                <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 motion-safe:transition-colors ${effStatus === id ? 'border-blue-600 bg-gray-100 dark:border-blue-400 dark:bg-gray-800' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60'}`}>
                  <input type="radio" name="status" checked={effStatus === id} onChange={() => setStatus(id)} className={`mt-1 size-4 accent-blue-600 ${focusRing}`} />
                  <span className="flex-1"><span className="flex items-center gap-2 text-sm font-semibold"><StatusPill status={id} /></span><span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">{help}</span></span>
                </label>
              ))}
            </div>
            {effStatus === 'maintenance' || effStatus === 'down' || effStatus === 'draft' ? (
              <Field label={effStatus === 'draft' ? 'Note for administrators' : 'Reason shown to members'} changed={reason !== null && reason !== (s.statusReason ?? '')} hint="One short sentence.">
                <textarea aria-label={effStatus === 'draft' ? 'Note for administrators' : 'Reason shown to members'} value={effReason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputClass} h-auto py-2`} />
              </Field>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} disabled={!statusDirty} onClick={() => { setStatus(null); setReason(null) }}>Discard</button>
              <button type="button" className={btnPrimary} disabled={!statusDirty} onClick={() => { p.onSetSolutionStatus?.(s.id, effStatus, effStatus === 'ready' ? null : effReason || null); setStatus(null); setReason(null) }}>Apply status</button>
            </div>
            <div className="mt-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold">{s.archived ? 'Restore' : 'Archive'}</h3>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{s.archived ? 'Restoring makes the solution visible to members again in its previous status.' : 'Archiving hides the solution from members and the hub. Its configuration, access, and session handles are kept.'}</p>
              <button type="button" className={`${btnSecondary} mt-3`} onClick={() => (s.archived ? p.onArchiveSolution?.(s.id, false) : setConfirmArchive(true))}>{s.archived ? <ArchiveRestore className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden /> : <Archive className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />}{s.archived ? 'Restore solution' : 'Archive solution'}</button>
              <ConfirmDialog open={confirmArchive} onClose={() => setConfirmArchive(false)} title={`Archive ${s.name}?`} description="Members lose it from the hub, their favorites, and the sidebar; its configuration, access, and session handles are kept until you delete it." confirmLabel="Archive" danger onConfirm={() => p.onArchiveSolution?.(s.id, true)} />
            </div>
          </div>
        ) : null}

        {tab === 'access' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-600 dark:text-gray-400">Who can use this solution, read from role assignments. Read-only here.</p>
              <button type="button" className={btnSecondary} onClick={() => p.onManageAccess?.(s.id)}>Manage in Access</button>
            </div>
            {p.canAdminister === false ? <p className="text-xs text-gray-500">Only people holding solutions:admin can open this tab.</p> : null}
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-3.5 py-3 text-sm">
                  {g.principalType === 'user' ? <Avatar name={g.principalName} size="sm" /> : <span className="flex size-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">{g.via === null && g.memberCount !== null && g.principalName.includes(' ') ? <Building2 className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden /> : <UsersRound className="size-4 text-gray-600" strokeWidth={1.75} aria-hidden />}</span>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">{g.principalName}{g.memberCount !== null ? <span className="text-xs font-normal text-gray-500">{g.memberCount} members</span> : null}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">{g.roleName} · added by {g.addedBy}</div>
                  </div>
                  <Pill tone={g.scope === 'tenant' ? 'gray' : 'blue'}>{g.scope === 'tenant' ? 'Whole tenant' : 'This solution'}</Pill>
                </li>
              ))}
              {grants.length === 0 ? <li className="px-3.5 py-6 text-center text-sm text-gray-600 dark:text-gray-400">Nobody can use this solution yet.</li> : null}
            </ul>
            <p className="text-xs text-gray-500">Access is granted and taken back in one place, the Access screen of core administration. A grant made there for the whole tenant covers every solution, including the ones added later.</p>
          </div>
        ) : null}
      </div>

      {tab === 'general' || tab === 'chat' || tab === 'connection' ? (
        <SaveBar dirty={dirty} canSave={dirty && !invalid && (!connectionChanged || confirmConn)} onSave={() => { save(); setConfirmConn(false) }} onReset={() => { reset(); setConfirmConn(false) }} />
      ) : null}
    </SlideOver>
  )
}
