import { goTo } from '@/shell/components/routes'
import { useEffect, useRef, useState } from 'react'
import data from '@/../product/sections/solutions/data.json'
import type { ChatTheme, Conversation, Message, Solution, Viewer } from '@/../product/sections/solutions/types'
import { SolutionViewer } from './components/SolutionViewer'

const REASONING = 'Elective procedure, amount above the day-surgery threshold, pre-authorisation missing. Routine urgency; list the missing documents.'
const REPLY = 'Based on the summary, this claim is **Routine**. Two documents are still missing:\n\n1. Pre-authorisation form\n2. Itemised hospital bill\n\nRequest both before assigning a reviewer. See the [triage policy](https://intranet.meridianhealth.example/policies/claims-triage).'

export default function SolutionViewerPreview() {
  const params = new URLSearchParams(window.location.search)
  const solutions = data.solutions as Solution[]
  const picked = solutions.find((s) => s.slug === params.get('s')) ?? solutions[0]
  // ?status=maintenance|down shows any solution in that state without a second data row.
  const statusOverride = params.get('status') as Solution['status'] | null
  const solution: Solution = statusOverride
    ? { ...picked, status: statusOverride, statusReason: statusOverride === 'down' ? 'The portal is offline while its vendor migrates the database.' : 'The portal is upgrading. Expected back by 18:00 SGT.' }
    : picked
  const theme = (data.chatThemes as ChatTheme[]).find((t) => t.id === (solution.chatThemeId ?? 'default')) ?? (data.chatThemes as ChatTheme[])[0]
  const startEmpty = params.get('empty') === '1'
  const resumed = params.get('resumed') === '1'
  const withError = params.get('error') === '1'
  const frame = (params.get('frame') as 'loading' | 'ready' | 'failed' | null) ?? 'ready'
  const focused = params.get('focus') === '1'
  // ?preview=1 is the administrator's labeled preview; ?vote=down shows the thank-you toast.
  const preview = params.get('preview') === '1'
  const asAdmin = preview || params.get('admin') === '1'
  const streamingShot = params.get('streaming') === '1'
  const interrupted = params.get('interrupted') === '1'

  const base: Conversation = { solutionId: solution.id, startedAt: new Date().toISOString(), streaming: false, resumed, error: null, messages: [] }
  const [conv, setConv] = useState<Conversation | null>(() => {
    if (startEmpty || resumed || solution.id !== data.conversation.solutionId) return base
    const c = data.conversation as Conversation
    if (streamingShot || interrupted) {
      // A reply mid-stream: the reasoning is still arriving, so the Thinking disclosure is open.
      const head = c.messages.slice(0, 3)
      const last: Message = { id: 'a-stream', role: 'assistant', text: '', reasoning: interrupted ? REASONING.slice(0, 74) : REASONING.slice(0, 96), at: c.messages[3].at, feedback: null, interrupted }
      return { ...c, streaming: !interrupted, messages: [...head, last] }
    }
    return withError ? { ...c, error: 'The solution did not respond correctly. Try again.' } : c
  })
  const [fav, setFav] = useState(data.favorites.some((f) => f.solutionId === solution.id))

  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  // Fake a streamed reply for the preview: reasoning first, then the answer.
  const send = (_id: string, text: string) => {
    const now = new Date().toISOString()
    const user: Message = { id: `u${Date.now()}`, role: 'user', text, at: now }
    const bot: Message = { id: `a${Date.now()}`, role: 'assistant', text: '', reasoning: '', at: now, feedback: null }
    setConv((c) => ({ ...(c ?? base), streaming: true, error: null, resumed: false, messages: [...(c?.messages ?? []), user, bot] }))
    let i = 0
    const total = REASONING.length + REPLY.length
    timer.current = window.setInterval(() => {
      i += 6
      setConv((c) => {
        if (!c) return c
        const msgs = c.messages.slice()
        const r = Math.min(i, REASONING.length)
        const a = Math.max(0, i - REASONING.length)
        msgs[msgs.length - 1] = { ...bot, reasoning: REASONING.slice(0, r), text: REPLY.slice(0, a) }
        const done = i >= total
        if (done && timer.current) { window.clearInterval(timer.current); timer.current = null }
        return { ...c, messages: msgs, streaming: !done }
      })
    }, 30)
  }

  return (
    <SolutionViewer
      preview={preview}
      viewer={asAdmin ? { ...(data.viewer as Viewer), id: 'usr_priya', name: 'Priya Nair', permissions: ['solutions:use', 'solutions:admin'] } : (data.viewer as Viewer)}
      solution={solution}
      theme={theme}
      conversation={conv}
      isFavorite={fav}
      focused={focused}
      frameState={frame}
      onBack={() => goTo('/')}
      onSendMessage={send}
      onStopStreaming={() => { if (timer.current) window.clearInterval(timer.current); timer.current = null; setConv((c) => (c ? { ...c, streaming: false, messages: c.messages.map((m, i) => (i === c.messages.length - 1 && m.role === 'assistant' ? { ...m, interrupted: true } : m)) } : c)) }}
      onNewChat={() => setConv({ ...base, resumed: false })}
      onRetrySend={() => { const last = [...(conv?.messages ?? [])].reverse().find((m) => m.role === 'user'); setConv((c) => (c ? { ...c, error: null } : c)); if (last) send(solution.id, last.text) }}
      onSendFeedback={(_s, mid, vote) => setConv((c) => (c ? { ...c, messages: c.messages.map((m) => (m.id === mid ? { ...m, feedback: m.feedback === vote ? null : vote } : m)) } : c))}
      onToggleFavorite={() => setFav((v) => !v)}
      onToggleFocus={(f) => { const u = new URL(window.location.href); if (f) u.searchParams.set('focus', '1'); else u.searchParams.delete('focus'); window.location.assign(u.toString()) }}
      onReloadFrame={() => { const u = new URL(window.location.href); u.searchParams.delete('frame'); window.location.assign(u.toString()) }}
      onFullscreen={() => console.log('Fullscreen requested')}
    />
  )
}
