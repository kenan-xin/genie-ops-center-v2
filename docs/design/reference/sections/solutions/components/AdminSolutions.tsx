import { useMemo, useState } from 'react'
import { MessageSquareText, PanelTop, Plus } from 'lucide-react'
import type { AccessGrant, Category, ChatTheme, Solution, SolutionInput, SolutionStatus, SolutionType } from '@/../product/sections/solutions/types'
import { DEFAULT_CHAT_API_ENDPOINT, btnPrimary, btnSecondary, focusRing, initials, inputClass, isPublicHttps, labelClass, relativeTime } from './helpers'
import { BottomBar, Card, ConfirmDialog, Dialog, EmptyRow, Monogram, Pill, RowMenu, SearchField, Select, StatusPill, Th, Td } from './ui'
import { ChatDisabledNotice, ConfigureSolutionSlideOver } from './ConfigureSolutionSlideOver'

function SwitchRow({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5 dark:border-gray-800">
      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{help}</span></span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 dark:bg-gray-700" />
        <span className="absolute left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export interface AdminSolutionsProps {
  solutions: Solution[]
  categories: Category[]
  chatThemes: ChatTheme[]
  /** False when the deployment has chat streaming disabled (DEC-30). Defaults to true. */
  chatEnabled?: boolean
  accessGrants: AccessGrant[]
  initialSolutionId?: string | null
  /** Preview only: opens a dialog or a configure tab straight away for screenshots. */
  initialDialog?: 'register' | 'delete'
  initialTab?: string | null
  canAdminister?: boolean
  onRegisterSolution?: (input: Pick<SolutionInput, 'name' | 'description' | 'categoryId' | 'type'> & Partial<Pick<SolutionInput, 'externalBotId' | 'apiEndpoint' | 'feedbackEnabled' | 'iframeUrl' | 'allowFullscreen'>>) => void
  onDuplicateSolution?: (solutionId: string) => void
  onDeleteSolution?: (solutionId: string) => void
  onUpdateSolution?: (solutionId: string, input: Partial<SolutionInput>) => void
  onSetSolutionStatus?: (solutionId: string, status: SolutionStatus, reason: string | null) => void
  onArchiveSolution?: (solutionId: string, archived: boolean) => void
  onAddAccess?: (solutionId: string) => void
  onRemoveAccess?: (grantId: string) => void
  onPreview?: (solutionId: string) => void
}

const statusOrder: Record<SolutionStatus, number> = { down: 0, maintenance: 1, draft: 2, ready: 3 }

export function AdminSolutions(p: AdminSolutionsProps) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | SolutionStatus>('all')
  const [type, setType] = useState<'all' | SolutionType>('all')
  const [cat, setCat] = useState('all')
  const [sort, setSort] = useState<'updated' | 'name' | 'status'>('updated')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState<string | null>(p.initialSolutionId ?? null)
  const [registering, setRegistering] = useState(p.initialDialog === 'register')
  const [rName, setRName] = useState('')
  const [rDesc, setRDesc] = useState('')
  const [rCat, setRCat] = useState('')
  const [rType, setRType] = useState<SolutionType>(p.chatEnabled === false ? 'embedded' : 'chat')
  // Type-specific connection fields, collected at registration so a new solution is usable from Configure onward.
  const [rBot, setRBot] = useState('')
  const [rEndpoint, setREndpoint] = useState(DEFAULT_CHAT_API_ENDPOINT)
  const [rFeedback, setRFeedback] = useState(true)
  const [rIframe, setRIframe] = useState('')
  const [rFullscreen, setRFullscreen] = useState(false)
  const rEndpointValid = isPublicHttps(rEndpoint)
  const rIframeValid = isPublicHttps(rIframe)
  const rTypeValid = rType === 'chat' ? rBot.trim().length > 0 && rBot.length <= 200 && rEndpointValid : rIframeValid
  const resetRegister = () => { setRegistering(false); setRName(''); setRDesc(''); setRCat(''); setRType(p.chatEnabled === false ? 'embedded' : 'chat'); setRBot(''); setREndpoint(DEFAULT_CHAT_API_ENDPOINT); setRFeedback(true); setRIframe(''); setRFullscreen(false) }
  const [confirmDelete, setConfirmDelete] = useState<Solution | null>(p.initialDialog === 'delete' ? p.solutions.find((s) => s.archived) ?? null : null)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return p.solutions
      .filter((s) => (showArchived || !s.archived) && (!t || s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t)) && (status === 'all' || s.status === status) && (type === 'all' || s.type === type) && (cat === 'all' || (cat === 'none' ? !s.categoryId : s.categoryId === cat)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'status' ? statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)))
  }, [p.solutions, q, status, type, cat, sort, showArchived])

  const rowMenu = (s: Solution) => [
    { label: 'Duplicate as draft', onSelect: () => p.onDuplicateSolution?.(s.id) },
    s.archived ? { label: 'Restore', onSelect: () => p.onArchiveSolution?.(s.id, false) } : { label: 'Archive', onSelect: () => p.onArchiveSolution?.(s.id, true) },
    ...(s.archived ? [{ label: 'Delete permanently', danger: true, onSelect: () => setConfirmDelete(s) }] : []),
  ]

  const catName = (id: string | null) => p.categories.find((c) => c.id === id)?.name ?? 'Other'
  // Only a chat solution has a theme (DEC-26).
  const themeName = (s: Solution) => (s.type === 'chat' ? p.chatThemes.find((t) => t.id === (s.chatThemeId ?? 'default'))?.name ?? 'Tenant branding' : null)
  const accessCount = (s: Solution) => p.accessGrants.filter((g) => g.solutionId === s.id || g.scope === 'tenant').length
  const archivedCount = p.solutions.filter((s) => s.archived).length
  const open = p.solutions.find((s) => s.id === openId) ?? null

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Search solutions" />
        <Select ariaLabel="Filter by type" value={type} onChange={(v) => setType(v as typeof type)}>
          <option value="all">All types</option><option value="chat">Chat</option><option value="embedded">Embedded</option>
        </Select>
        <Select ariaLabel="Filter by status" value={status} onChange={(v) => setStatus(v as typeof status)}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="ready">Ready</option><option value="maintenance">Maintenance</option><option value="down">Down</option>
        </Select>
        <Select ariaLabel="Sort" value={sort} onChange={(v) => setSort(v as typeof sort)}>
          <option value="updated">Recently updated</option><option value="name">Name</option><option value="status">Status</option>
        </Select>
        <Select ariaLabel="Filter by category" value={cat} onChange={setCat}>
          <option value="all">All categories</option>
          {p.categories.slice().sort((a, b) => a.position - b.position).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">Other</option>
        </Select>
        {archivedCount > 0 ? (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 rounded accent-blue-600" />Show archived ({archivedCount})</label>
        ) : null}
        {/* Under md the primary action moves to the sticky bottom bar (DEC-25). */}
        <div className="ml-auto hidden md:block"><button type="button" className={btnPrimary} onClick={() => setRegistering(true)}><Plus className="size-5" strokeWidth={2} aria-hidden />Register solution</button></div>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
          {rows.map((s) => (
            <li key={s.id} className={`flex items-center gap-2 pr-2 ${s.archived ? 'opacity-60' : ''}`}>
              <button type="button" onClick={() => setOpenId(s.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
                <Monogram text={s.monogram} color={s.accentColor} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5"><span className="truncate font-semibold">{s.name}</span><Pill>{s.type === 'embedded' ? 'Embedded' : 'Chat'}</Pill><StatusPill status={s.status} />{s.archived ? <Pill>Archived</Pill> : null}</span>
                  <span className="block text-xs text-gray-600 dark:text-gray-400">{catName(s.categoryId)}{themeName(s) ? ` · ${themeName(s)}` : ''} · {accessCount(s)} grants · {relativeTime(s.updatedAt)}</span>
                </span>
              </button>
              <RowMenu items={rowMenu(s)} />
            </li>
          ))}
          {rows.length === 0 ? <li className="px-5 py-12 text-center text-sm text-gray-600 dark:text-gray-400">No solutions match.</li> : null}
        </ul>
        <div className="hidden md:block">
          <table className="w-full">
            {/* Theme is the first column to go: the sidebar takes 240px, so at a 1280 viewport it only fits from 2xl. */}
            <thead className="bg-gray-50 dark:bg-gray-950/50"><tr><Th>Solution</Th><Th>Type</Th><Th>Category</Th><Th>Status</Th><Th className="hidden 2xl:table-cell">Theme</Th><Th className="text-right">Access</Th><Th>Updated</Th><Th /></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((s) => (
                <tr key={s.id} tabIndex={0} onClick={() => setOpenId(s.id)} onKeyDown={(e) => e.key === 'Enter' && setOpenId(s.id)} className={`cursor-pointer outline-none motion-safe:transition-colors hover:bg-gray-50 focus-visible:bg-blue-50/60 dark:hover:bg-gray-800/60 ${s.archived ? 'opacity-60' : ''} ${openId === s.id ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Monogram text={s.monogram} color={s.accentColor} size="sm" />
                      <div className="min-w-0"><div className="flex items-center gap-1.5 font-semibold">{s.name}{s.archived ? <Pill>Archived</Pill> : null}</div><div className="max-w-[210px] truncate text-xs text-gray-600 dark:text-gray-400 2xl:max-w-[240px]">{s.description}</div></div>
                    </div>
                  </Td>
                  <Td><Pill>{s.type === 'embedded' ? <><PanelTop className="size-4" strokeWidth={2} aria-hidden />Embedded</> : <><MessageSquareText className="size-4" strokeWidth={2} aria-hidden />Chat</>}</Pill></Td>
                  <Td className="text-gray-700 dark:text-gray-300">{catName(s.categoryId)}</Td>
                  <Td><div className="flex flex-col items-start gap-0.5"><StatusPill status={s.status} />{s.statusReason && s.status !== 'ready' ? <span className="max-w-[150px] truncate text-xs text-gray-500">{s.statusReason}</span> : null}</div></Td>
                  <Td className="hidden text-gray-700 2xl:table-cell dark:text-gray-300">{themeName(s) ?? <span className="text-gray-500">—</span>}</Td>
                  <Td className="text-right tabular-nums text-gray-700 dark:text-gray-300">{accessCount(s)}</Td>
                  <Td className="whitespace-nowrap text-gray-700 dark:text-gray-300">{relativeTime(s.updatedAt)}</Td>

                  <Td className="text-right"><RowMenu items={rowMenu(s)} /></Td>
                </tr>
              ))}
              {rows.length === 0 ? <EmptyRow colSpan={8}>No solutions match.</EmptyRow> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">{rows.length} of {p.solutions.length} solutions. New solutions start as Draft and are visible to administrators only.</div>
      </Card>

      <ConfigureSolutionSlideOver solution={open} initialTab={p.initialTab} onClose={() => setOpenId(null)} categories={p.categories} chatThemes={p.chatThemes} chatEnabled={p.chatEnabled} accessGrants={p.accessGrants} canAdminister={p.canAdminister} onUpdateSolution={p.onUpdateSolution} onSetSolutionStatus={p.onSetSolutionStatus} onArchiveSolution={p.onArchiveSolution} onAddAccess={p.onAddAccess} onRemoveAccess={p.onRemoveAccess} onPreview={p.onPreview} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        description="This cannot be undone. Every member's favorite and recent entry for it goes with it, and every stored session handle, so no conversation can be resumed. Audit events that mention it are kept."
        confirmLabel="Delete permanently"
        danger
        onConfirm={() => { if (confirmDelete) { p.onDeleteSolution?.(confirmDelete.id); if (openId === confirmDelete.id) setOpenId(null) } }}
      />

      <Dialog
        open={registering}
        onClose={() => setRegistering(false)}
        title="Register solution"
        description="Name it, place it, pick its type, and connect it. Theme, welcome text, and starter prompts come later in Configure. It starts as Draft."
        footer={<><button type="button" className={btnSecondary} onClick={() => setRegistering(false)}>Cancel</button><button type="button" className={btnPrimary} disabled={!rName.trim() || rName.length > 80 || rDesc.length > 500 || !rTypeValid} onClick={() => { p.onRegisterSolution?.(rType === 'chat' ? { name: rName.trim(), description: rDesc.trim(), categoryId: rCat || null, type: rType, externalBotId: rBot.trim(), apiEndpoint: rEndpoint.trim(), feedbackEnabled: rFeedback } : { name: rName.trim(), description: rDesc.trim(), categoryId: rCat || null, type: rType, iframeUrl: rIframe.trim(), allowFullscreen: rFullscreen }); resetRegister() }}>Register as draft</button></>}
      >
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Type" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([['chat', 'Chat', 'A streaming conversation with an external bot, styled by a chat theme.', MessageSquareText], ['embedded', 'Embedded', 'An external web app shown inside Genie Ops Center in a sandboxed frame.', PanelTop]] as Array<[SolutionType, string, string, typeof MessageSquareText]>).map(([id, label, help, Icon]) => (
              <label key={id} className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 motion-safe:transition-colors ${id === 'chat' && p.chatEnabled === false ? 'cursor-not-allowed border-gray-200 opacity-70 dark:border-gray-800' : 'cursor-pointer'} ${rType === id ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60'}`}>
                <input type="radio" name="solution-type" checked={rType === id} disabled={id === 'chat' && p.chatEnabled === false} onChange={() => setRType(id)} className={`mt-1 size-4 accent-blue-600 ${focusRing}`} />
                <span className="flex-1"><span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="size-4 text-gray-500" strokeWidth={1.75} aria-hidden />{label}</span><span className="mt-0.5 block text-xs text-gray-600 dark:text-gray-400">{help}</span>{id === 'chat' && p.chatEnabled === false ? <span role="status" className="mt-1.5 block text-xs font-medium text-gray-800 dark:text-gray-200">Chat solutions are not enabled on this deployment. Contact your Genie operator.</span> : null}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1.5"><label htmlFor="rs-name" className={`${labelClass} flex justify-between`}>Name<span className={`font-normal ${rName.length > 80 ? 'text-red-600' : 'text-gray-500'}`}>{rName.length}/80</span></label><input id="rs-name" autoFocus maxLength={80} value={rName} onChange={(e) => setRName(e.target.value)} placeholder="For example, Claims Status Bot" className={inputClass} aria-invalid={rName.length > 80} />{rName.length > 80 ? <span role="alert" className="text-xs text-red-700">Keep the name to 80 characters.</span> : <span className="text-xs text-gray-600 dark:text-gray-400">The link slug is derived from this name once and never changes.</span>}</div>
          <div className="flex flex-col gap-1.5"><label htmlFor="rs-desc" className={`${labelClass} flex justify-between`}>Description<span className={`font-normal ${rDesc.length > 500 ? 'text-red-600' : 'text-gray-500'}`}>{rDesc.length}/500</span></label><textarea id="rs-desc" rows={2} maxLength={500} value={rDesc} onChange={(e) => setRDesc(e.target.value)} placeholder="One or two lines shown on the card" className={`${inputClass} h-auto py-2`} aria-invalid={rDesc.length > 500} /></div>
          <div className="flex flex-col gap-1.5"><label htmlFor="rs-cat" className={labelClass}>Category</label>
            <select id="rs-cat" value={rCat} onChange={(e) => setRCat(e.target.value)} className={`${inputClass} appearance-none`}>
              <option value="">Other (no category)</option>
              {p.categories.slice().sort((a, b) => a.position - b.position).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {rName.trim() ? <p className="text-xs text-gray-600 dark:text-gray-400">Monogram <span className="font-mono font-semibold">{initials(rName)}</span>, from the first two words. Change it in Configure.</p> : null}

          {/* Type-specific connection: the fields differ by type and are required to register. Theme, welcome text, and starter prompts stay in Configure. */}
          <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{rType === 'chat' ? 'Chat connection' : 'Embedded application'}</p>
            {rType === 'chat' ? (
              <>
                {p.chatEnabled === false ? <ChatDisabledNotice /> : null}
                <div className="flex flex-col gap-1.5"><label htmlFor="rs-bot" className={labelClass}>External bot id</label><input id="rs-bot" value={rBot} maxLength={200} onChange={(e) => setRBot(e.target.value)} placeholder="bot_7f3a9c" className={`${inputClass} font-mono`} /><span className="text-xs text-gray-600 dark:text-gray-400">The Genie Ops Center chat API bot this solution talks to. At most 200 characters.</span></div>
                <div className="flex flex-col gap-1.5"><label htmlFor="rs-endpoint" className={labelClass}>API endpoint</label><input id="rs-endpoint" value={rEndpoint} onChange={(e) => setREndpoint(e.target.value)} className={`${inputClass} font-mono`} aria-invalid={!rEndpointValid} />{rEndpointValid ? <span className="text-xs text-gray-600 dark:text-gray-400">Prefilled with the deployment's usual address. A public HTTPS address whose origin the deployment allows.</span> : <span role="alert" className="text-xs text-red-700">Enter a public https:// address.</span>}</div>
                <SwitchRow label="Feedback" help="Thumbs up and down on every reply." checked={rFeedback} onChange={setRFeedback} />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5"><label htmlFor="rs-iframe" className={labelClass}>Application URL</label><input id="rs-iframe" value={rIframe} onChange={(e) => setRIframe(e.target.value)} placeholder="https://app.example.com/portal" className={`${inputClass} font-mono`} aria-invalid={rIframe.length > 0 && !rIframeValid} />{rIframe.length > 0 && !rIframeValid ? <span role="alert" className="text-xs text-red-700">Enter a public https:// address.</span> : <span className="text-xs text-gray-600 dark:text-gray-400">Shown in a sandboxed frame. Private, loopback, and plain HTTP addresses are refused. The app must allow being framed by this deployment.</span>}</div>
                <SwitchRow label="Allow fullscreen" help="Adds a Fullscreen control to the viewer header." checked={rFullscreen} onChange={setRFullscreen} />
              </>
            )}
          </div>
        </div>
      </Dialog>

      <BottomBar><button type="button" className={btnPrimary} onClick={() => setRegistering(true)}><Plus className="size-5" strokeWidth={2} aria-hidden />Register solution</button></BottomBar>
    </div>
  )
}
