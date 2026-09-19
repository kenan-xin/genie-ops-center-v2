import { Fragment, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Info, Maximize2, MoreHorizontal, RotateCcw, Square, Star, ThumbsDown, ThumbsUp, WrenchIcon, X } from 'lucide-react'
import type { ChatTheme, Conversation, Message, Solution, Viewer } from '@/../product/sections/solutions/types'
import { btnPrimary, btnSecondary, focusRing, foregroundFor } from './helpers'
import { ConfirmDialog, Monogram, Pill, StatusPill } from './ui'

export interface SolutionViewerProps {
  viewer: Viewer
  solution: Solution
  /** Chat only. Ignored for embedded solutions. */
  theme: ChatTheme
  conversation: Conversation | null
  isFavorite: boolean
  /** Focus mode hides the shell navigation. The shell owns the state; the viewer shows the toggle. */
  focused?: boolean
  /** Embedded only: preview state of the frame. */
  frameState?: 'loading' | 'ready' | 'failed'
  /** Sends are disabled while offline. */
  offline?: boolean
  /** Administrator preview of any solution, including Draft. Labeled, audited, never counted as access (DEC-27). */
  preview?: boolean
  onBack?: () => void
  onSendMessage?: (solutionId: string, text: string) => void
  onStopStreaming?: (solutionId: string) => void
  onNewChat?: (solutionId: string) => void
  onRetrySend?: (solutionId: string) => void
  onSendFeedback?: (solutionId: string, messageId: string, vote: 'up' | 'down') => void
  onToggleFavorite?: (solutionId: string) => void
  onToggleFocus?: (focused: boolean) => void
  onReloadFrame?: () => void
  /** Embedded only: request fullscreen on the frame. */
  onFullscreen?: () => void
}

const FONT_STACK: Record<string, string> = {
  'plus-jakarta-sans': '"Plus Jakarta Sans", system-ui, sans-serif',
  'ibm-plex-sans': '"IBM Plex Sans", system-ui, sans-serif',
  manrope: 'Manrope, system-ui, sans-serif',
  'source-serif-4': '"Source Serif 4", Georgia, serif',
}

/* One hairline row of controls. No colored band: the theme color lives on the assistant mark in the
 * transcript. The color stays out of the base so a caller can override it: two `text-*` utilities in one class
 * string are settled by the stylesheet's order, not by which one is written last. */
const iconBase = `flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800 ${focusRing}`
const iconInk = 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
const iconBtn = () => `${iconBase} ${iconInk}`
const textBtn = `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 ${focusRing}`
/** The composer's one action. It wears the theme color, so it cannot borrow the blue primary button's fill or its blue shadow. */
const sendBtn = `flex size-10 shrink-0 items-center justify-center rounded-lg motion-safe:transition-colors disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-600 ${focusRing}`

/** Day label above the first message of each day, so a resumed conversation says when it happened. */
function dayLabel(at: string) {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const d = new Date(at)
  const days = Math.round((midnight(new Date()) - midnight(d)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

/* Rich text: sanitized markdown subset. Bold, lists, paragraphs, https and mailto links, fenced code with
 * diagram and chart blocks. No raw HTML passes through. */
function inline(s: string, key: string) {
  const parts = s.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https:|mailto:)[^)\s]+\))/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
    const link = /^\[([^\]]+)\]\(((?:https:|mailto:)[^)\s]+)\)$/.exec(part)
    if (link) return <a key={`${key}-${i}`} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{link[1]}</a>
    return <span key={`${key}-${i}`}>{part}</span>
  })
}

function FencedBlock({ lang, code }: { lang: string; code: string }) {
  const [showCode, setShowCode] = useState(false)
  const kind = lang === 'mermaid' ? 'Diagram' : lang === 'vega-lite' ? 'Chart' : null
  if (!kind) return <pre className="overflow-x-auto rounded-lg bg-black/5 p-3 font-mono text-xs leading-relaxed dark:bg-white/10"><code>{code}</code></pre>
  // Design stand-in: the renderer draws the diagram or chart; the code is one tap away as the fallback.
  // No card around it. A reply is page text, so a figure inside one is separated by two hairlines, never
  // boxed, and it borrows no color of its own.
  return (
    <figure className="my-1 border-y border-gray-200 py-3 dark:border-gray-800">
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">{kind}</span>
        <button type="button" onClick={() => setShowCode((v) => !v)} className={`rounded-md text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 ${focusRing}`}>{showCode ? `Show ${kind.toLowerCase()}` : 'Show code'}</button>
      </figcaption>
      {showCode ? (
        <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-gray-600 dark:text-gray-400"><code>{code}</code></pre>
      ) : lang === 'mermaid' ? (
        <MermaidStandIn code={code} />
      ) : (
        <div className="flex h-36 items-end gap-2 pt-2" aria-label="Chart">{[40, 65, 30, 80, 55, 70].map((h, i) => <span key={i} className="flex-1 rounded-t-sm bg-gray-200 dark:bg-gray-700" style={{ height: `${h}%` }} />)}</div>
      )}
    </figure>
  )
}

/** Lays out a mermaid flowchart's nodes as boxes in reading order, enough to show the design intent. */
function MermaidStandIn({ code }: { code: string }) {
  const nodes: string[] = []
  const seen = new Set<string>()
  for (const m of code.matchAll(/([A-Z])[[{]([^\]}]+)[\]}]/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); nodes.push(m[2]) }
  }
  // A decision node reads as a decision through weight and a darker tint. Amber in this design system is
  // only ever a real warning, and a flow step is not one.
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
      {nodes.map((n, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className={`rounded-md px-2 py-1 ${/\?$/.test(n) ? 'bg-gray-200 font-semibold dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'}`}>{n}</span>
          {i < nodes.length - 1 ? <ChevronRight aria-hidden className="size-4 shrink-0 text-gray-400 dark:text-gray-500" strokeWidth={1.75} /> : null}
        </span>
      ))}
    </div>
  )
}

function renderRich(text: string) {
  const out: React.ReactNode[] = []
  const fence = /```([a-z-]*)\n([\s\S]*?)```/g
  let last = 0
  let k = 0
  const pushBlocks = (chunk: string) => {
    for (const b of chunk.split(/\n{2,}/)) {
      if (!b.trim()) continue
      const lines = b.split('\n')
      const key = `b${k++}`
      if (lines.every((l) => /^\d+\.\s/.test(l))) out.push(<ol key={key} className="list-decimal space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\.\s/, ''), `${key}-${j}`)}</li>)}</ol>)
      else if (lines.every((l) => /^[-*]\s/.test(l))) out.push(<ul key={key} className="list-disc space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s/, ''), `${key}-${j}`)}</li>)}</ul>)
      else out.push(<p key={key}>{inline(b, key)}</p>)
    }
  }
  for (const m of text.matchAll(fence)) {
    pushBlocks(text.slice(last, m.index))
    out.push(<FencedBlock key={`f${k++}`} lang={m[1]} code={m[2].trim()} />)
    last = (m.index ?? 0) + m[0].length
  }
  pushBlocks(text.slice(last))
  return out
}

function Reasoning({ text, streaming, interrupted, seconds }: { text: string; streaming: boolean; interrupted?: boolean; seconds: number }) {
  // Open while streaming, collapsed once the answer begins, unless the person toggled it by hand.
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? streaming
  const setOpen = (fn: (v: boolean) => boolean) => setManual(fn(open))
  const label = streaming ? 'Thinking' : interrupted ? 'Reasoning interrupted' : `Thought for ${seconds} s`
  return (
    <div className="mb-1.5 max-w-full text-xs">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 ${focusRing}`}>
        <ChevronDown className={`size-4 motion-safe:transition-transform ${open ? '' : '-rotate-90'}`} strokeWidth={2} aria-hidden />
        <span className={streaming ? 'motion-safe:animate-pulse' : ''}>{label}</span>
      </button>
      {open ? <div className="ml-2 mt-1 border-l border-gray-200 pl-3 leading-relaxed text-gray-600 dark:border-gray-800 dark:text-gray-400">{text}{streaming ? <span aria-hidden className="ml-0.5 inline-block h-3 w-[2px] motion-safe:animate-pulse bg-current align-middle" /> : null}</div> : null}
    </div>
  )
}

/**
 * `showTime`: the time is always visible under the last turn of a run (same side, within five minutes); never hover-only.
 * Your turn is a bubble in the theme color. An assistant reply is plain page text behind a small square
 * mark, so a long answer reads as a document and the tenant color stays an accent, never a wall.
 */
function Turn({ m, theme, monogram, streaming, feedbackEnabled, showTime, onFeedback }: { m: Message; theme: ChatTheme; monogram: string; streaming?: boolean; feedbackEnabled: boolean; showTime: boolean; onFeedback?: (vote: 'up' | 'down') => void }) {
  const time = new Date(m.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })

  if (m.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div
          className="max-w-[74%] space-y-2 px-3.5 py-2.5 text-base leading-relaxed"
          style={{ backgroundColor: theme.userBubbleColor, color: theme.userBubbleForeground, borderRadius: theme.radius, borderBottomRightRadius: Math.min(6, theme.radius) }}
        >
          {renderRich(m.text)}
        </div>
        {showTime ? <time dateTime={m.at} className="px-1 text-xs tabular-nums text-gray-500">{time}</time> : null}
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-extrabold tracking-tight" style={{ backgroundColor: theme.headerColor, color: theme.headerForeground }}>{monogram}</span>
      <div className="min-w-0 flex-1">
        {m.reasoning ? <Reasoning text={m.reasoning} streaming={Boolean(streaming && !m.text)} interrupted={m.interrupted && !m.text} seconds={Math.max(1, Math.round(m.reasoning.length / 40))} /> : null}
        <div className="space-y-2 text-base leading-relaxed text-gray-800 dark:text-gray-200">
          {renderRich(m.text)}
          {streaming ? <span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] motion-safe:animate-pulse bg-current align-middle" /> : null}
        </div>
        {showTime || ((m.interrupted || feedbackEnabled) && !streaming) ? (
          <div className="mt-1.5 flex min-h-6 items-center gap-2 text-xs text-gray-500">
            {showTime ? <time dateTime={m.at} className="tabular-nums">{time}</time> : null}
            {m.interrupted && !streaming ? <Pill tone="amber"><AlertTriangle className="size-4" strokeWidth={2} aria-hidden />Incomplete response</Pill> : null}
            {feedbackEnabled && !streaming ? (
              <span className="ml-auto flex items-center gap-0.5">
                {(['up', 'down'] as const).map((v) => (
                  <button key={v} type="button" aria-label={v === 'up' ? 'Helpful' : 'Not helpful'} aria-pressed={m.feedback === v} onClick={() => onFeedback?.(v)} className={`flex size-8 items-center justify-center rounded-lg motion-safe:transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing} ${m.feedback === v ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>
                    {v === 'up' ? <ThumbsUp className="size-4" strokeWidth={1.75} /> : <ThumbsDown className="size-4" strokeWidth={1.75} />}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** True when message i closes a run: the next message is from the other side, or more than five minutes later. */
function endsRun(messages: Message[], i: number) {
  const next = messages[i + 1]
  return !next || next.role !== messages[i].role || new Date(next.at).getTime() - new Date(messages[i].at).getTime() > 5 * 60 * 1000
}

export function SolutionViewer(p: SolutionViewerProps) {
  const { viewer, solution: s, theme, conversation, isFavorite, focused = false, frameState = 'ready', offline = false, preview = false } = p
  const [draft, setDraft] = useState('')
  const [confirmNew, setConfirmNew] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const type = s.type
  const canAdminister = viewer.permissions.includes('solutions:admin')
  const previewing = preview && canAdminister
  const messages = conversation?.messages ?? []
  const streaming = conversation?.streaming ?? false
  const sendError = conversation?.error ?? null
  const blocked = s.status === 'maintenance' || s.status === 'down'
  const canSend = !blocked && !streaming && !sendError && !offline && draft.trim().length > 0

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length, streaming])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  const send = (text: string) => { if (!canSend && !(text && !blocked && !streaming && !sendError && !offline)) return; p.onSendMessage?.(s.id, text.trim()); setDraft('') }
  const newChat = () => { if (streaming) return; if (messages.length) setConfirmNew(true); else p.onNewChat?.(s.id) }

  const notice = blocked ? (
    <div role={s.status === 'down' ? 'alert' : 'status'} className={`mx-auto my-8 flex max-w-xl items-start gap-3 rounded-xl border px-5 py-4 ${s.status === 'down' ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-amber-100'}`}>
      {s.status === 'down' ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" strokeWidth={1.75} aria-hidden /> : <WrenchIcon className="mt-0.5 size-5 shrink-0 text-amber-600" strokeWidth={1.75} aria-hidden />}
      <div>
        <p className="font-semibold">{s.status === 'down' ? 'This solution is unavailable.' : 'This solution is under maintenance.'}</p>
        <p className="mt-1 text-sm">{s.statusReason}</p>
        <p className="mt-2 text-xs opacity-80">{type === 'chat' ? 'Nothing is sent while it is in this state.' : 'The application is not loaded while it is in this state.'}</p>
      </div>
    </div>
  ) : null

  return (
    <div className={`flex h-full min-h-[70vh] flex-col overflow-hidden bg-white dark:bg-gray-900 ${focused ? '' : 'rounded-xl border border-gray-200 dark:border-gray-800'}`} style={type === 'chat' ? { fontFamily: FONT_STACK[theme.font] } : undefined}>
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-gray-200 px-2 sm:gap-2 sm:px-3 dark:border-gray-800">
        <button type="button" aria-label="Back to Solutions" onClick={() => p.onBack?.()} className={iconBtn()}><ArrowLeft className="size-5" strokeWidth={1.75} /></button>
        <Monogram text={s.monogram} color={s.accentColor} size="sm" />
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{s.name}</h2>
        {/* The type reads as a quiet label; a status that is not ready outranks it and takes the slot. */}
        {s.status !== 'ready' ? <StatusPill status={s.status} /> : <span className="hidden shrink-0 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:block dark:text-gray-400">{type === 'embedded' ? 'Embedded' : 'Chat'}</span>}
        <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:block dark:bg-gray-800" />
        <button type="button" aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={isFavorite} onClick={() => p.onToggleFavorite?.(s.id)} className={`${iconBase} ${isFavorite ? 'text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400' : iconInk}`}>
          <Star className="size-5" strokeWidth={1.75} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
        {/* Focus toggle, hidden on phones where the viewer is always full width. The wrapper carries the breakpoint so the button's inline-flex does not win over hidden. */}
        <span className="hidden md:contents">
          <button type="button" aria-pressed={focused} onClick={() => p.onToggleFocus?.(!focused)} className={textBtn}>
            {focused ? <><X className="size-4" strokeWidth={1.75} aria-hidden />Exit focus</> : <><Maximize2 className="size-4" strokeWidth={1.75} aria-hidden />Focus</>}
          </button>
        </span>
        {type === 'chat' ? (
          <>
            <span className="hidden sm:contents">
              <button type="button" className={textBtn} disabled={streaming || blocked} title={streaming ? 'Wait for the reply to finish' : undefined} onClick={newChat}>
                <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />New chat
              </button>
            </span>
            <span className="relative sm:hidden">
              <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} className={iconBtn()}><MoreHorizontal className="size-5" strokeWidth={1.75} /></button>
              {menuOpen ? (
                <span role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  <button type="button" role="menuitem" disabled={streaming || blocked} className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800 ${focusRing}`} onClick={() => { setMenuOpen(false); newChat() }}><RotateCcw className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />New chat</button>
                </span>
              ) : null}
            </span>
          </>
        ) : s.allowFullscreen && !blocked ? (
          <button type="button" aria-label="Fullscreen" className={textBtn} onClick={() => p.onFullscreen?.()}><Maximize2 className="size-4" strokeWidth={1.75} aria-hidden /><span className="hidden sm:inline">Fullscreen</span></button>
        ) : null}
      </header>

      {previewing ? (
        <div role="status" className="flex items-start gap-2.5 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-300">
          <Info className="mt-0.5 size-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1"><Pill tone="blue">Preview</Pill>{s.status === 'draft' ? <Pill>Draft</Pill> : null}<span>Previewing as a member. This preview is recorded and does not count as access.{s.status === 'draft' ? ' Members cannot see this solution yet.' : ''}{s.status === 'draft' && s.statusReason ? ` ${s.statusReason}` : ''}</span></span>
        </div>
      ) : null}

      <ConfirmDialog open={confirmNew} onClose={() => setConfirmNew(false)} title="Start a new chat?" description="Your current conversation with this solution is discarded and cannot be reopened." confirmLabel="New chat" danger onConfirm={() => p.onNewChat?.(s.id)} />

      {type === 'embedded' ? (
        <div className="relative min-h-0 flex-1 bg-gray-50 dark:bg-gray-950">
          {notice ? <div className="px-4">{notice}</div> : frameState === 'failed' ? (
            <div role="alert" className="mx-auto my-10 flex max-w-md flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <AlertTriangle className="size-6 text-red-600" strokeWidth={1.75} aria-hidden />
              <p className="text-base font-semibold">The application did not load.</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">It may be down or blocked by its own security policy. Try again, or contact your administrator.</p>
              <button type="button" className={btnPrimary} onClick={() => p.onReloadFrame?.()}><RotateCcw className="size-5" strokeWidth={2} aria-hidden />Reload</button>
            </div>
          ) : (
            <>
              {frameState === 'loading' ? (
                <div role="status" aria-label="Loading the application" className="absolute inset-0 flex flex-col gap-3 p-6">
                  <span className="sr-only">Loading the application</span>
                  <div className="h-10 w-1/3 rounded-lg bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800" />
                  <div className="h-32 w-full rounded-xl bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800" />
                  <div className="grid flex-1 grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="rounded-xl bg-gray-200 motion-safe:animate-pulse dark:bg-gray-800" />)}</div>
                </div>
              ) : null}
              {/* Sandboxed external application. The design shows a neutral frame stand-in. */}
              <div className={`absolute inset-0 flex flex-col ${frameState === 'loading' ? 'opacity-0' : 'opacity-100'} motion-safe:transition-opacity`} aria-label={`${s.name} application`} role="region">
                {/* Sandbox note: hidden on phones; the URL truncates, never overflows. */}
                <div className="hidden min-w-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 sm:flex dark:border-gray-800 dark:bg-gray-900"><span className="size-2 shrink-0 rounded-full bg-emerald-500" /><span className="shrink-0">sandbox: allow-scripts allow-forms{s.allowFullscreen ? ' · allow="fullscreen"' : ''} ·</span><code className="min-w-0 truncate font-mono">{s.iframeUrl}</code></div>
                <div className="flex flex-1 items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_12px,rgba(0,0,0,.03)_12px,rgba(0,0,0,.03)_24px)] text-sm text-gray-500 dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_12px,rgba(255,255,255,.04)_12px,rgba(255,255,255,.04)_24px)]">External application renders here</div>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
            {notice}
            {/* Empty state: no second monogram, the header already carries the mark forty pixels above. */}
            {!blocked && messages.length === 0 ? (
              <div className="mx-auto flex max-w-xl flex-col items-center gap-5 pt-14 text-center">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.01em]">{s.name}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{s.welcomeText}</p>
                  {conversation?.resumed ? <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"><Info className="size-4" strokeWidth={1.75} aria-hidden />Continuing your earlier conversation. Earlier messages are not shown.</p> : null}
                </div>
                {s.starterPrompts.length > 0 ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {s.starterPrompts.map((sp) => (
                      <button key={sp} type="button" disabled={offline} onClick={() => send(sp)} className={`min-h-10 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 motion-safe:transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-gray-100 ${focusRing}`}>{sp}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : !blocked ? (
              <div className="mx-auto flex max-w-[70ch] flex-col gap-7">
                {messages.map((m, i) => (
                  <Fragment key={m.id}>
                    {i === 0 || dayLabel(messages[i - 1].at) !== dayLabel(m.at) ? (
                      <p className="self-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{dayLabel(m.at)}</p>
                    ) : null}
                    <Turn m={m} theme={theme} monogram={s.monogram} streaming={streaming && i === messages.length - 1 && m.role === 'assistant'} showTime={endsRun(messages, i)} feedbackEnabled={Boolean(s.feedbackEnabled)} onFeedback={(v) => { p.onSendFeedback?.(s.id, m.id, v); if (v === 'down') setToast('Thanks. Your feedback helps improve this solution.') }} />
                  </Fragment>
                ))}
                {sendError ? (
                  <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    <span className="flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />{sendError}</span>
                    <button type="button" className={`${btnSecondary} text-red-800 dark:text-red-200`} onClick={() => p.onRetrySend?.(s.id)}><RotateCcw className="size-5" strokeWidth={1.75} aria-hidden />Retry</button>
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>
            ) : null}
          </div>

          {!blocked ? (
            <div className="border-t border-gray-200 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 dark:border-gray-800">
              <form className="mx-auto flex max-w-[70ch] items-end gap-2 rounded-xl border border-gray-500 bg-white p-1.5 pl-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:border-gray-500 dark:bg-gray-950 dark:focus-within:ring-blue-400 dark:focus-within:ring-offset-gray-950" onSubmit={(e) => { e.preventDefault(); if (canSend) send(draft) }}>
                <textarea
                  aria-label="Message"
                  value={draft}
                  disabled={offline || Boolean(sendError)}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (canSend) send(draft) } }}
                  placeholder={offline ? 'You are offline' : sendError ? 'Retry the last message or start a new chat' : theme.placeholder}
                  rows={1}
                  maxLength={8000}
                  className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-base outline-none placeholder:text-gray-500 disabled:cursor-not-allowed"
                  style={{ height: `${Math.min(160, 40 + Math.max(0, draft.split('\n').length - 1) * 22)}px` }}
                />
                {streaming ? (
                  <button type="button" aria-label="Stop generating" onClick={() => p.onStopStreaming?.(s.id)} className={sendBtn} style={{ backgroundColor: theme.userBubbleColor, color: foregroundFor(theme.userBubbleColor) }}><Square className="size-4" strokeWidth={2} fill="currentColor" /></button>
                ) : (
                  <button type="submit" aria-label="Send" title={sendError ? 'Retry the last message first' : offline ? 'You are offline' : undefined} disabled={!canSend} className={sendBtn} style={canSend ? { backgroundColor: theme.userBubbleColor, color: foregroundFor(theme.userBubbleColor) } : undefined}><ArrowUp className="size-4" strokeWidth={2.5} /></button>
                )}
              </form>
              <p className="mx-auto mt-2 flex max-w-[70ch] items-center justify-center gap-2 text-center text-xs text-gray-500"><span>{streaming ? 'Replying. One message at a time.' : `${s.name} can make mistakes. Check important details.`}</span>{draft.length > 7000 ? <span className={`tabular-nums ${draft.length >= 8000 ? 'text-red-700' : ''}`}>{draft.length}/8000</span> : null}</p>
            </div>
          ) : null}
        </>
      )}

      {toast ? (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium shadow-lg md:left-auto md:right-6 md:translate-x-0 dark:border-gray-700 dark:bg-gray-900">
          {toast}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className={`ml-1 flex size-8 items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 ${focusRing}`}><X className="size-4" strokeWidth={2} /></button>
        </div>
      ) : null}
    </div>
  )
}
