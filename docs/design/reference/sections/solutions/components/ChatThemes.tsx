import { useState } from 'react'
import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react'
import type { ApprovedFont, ChatTheme, ChatThemeInput, Solution } from '@/../product/sections/solutions/types'
import { btnPrimary, btnSecondary, contrastRatio, focusRing, inputClass, labelClass } from './helpers'
import { Card, ConfirmDialog, Pill } from './ui'

export interface ChatThemesProps {
  chatThemes: ChatTheme[]
  approvedFonts: ApprovedFont[]
  solutions: Solution[]
  initialThemeId?: string | null
  onCreateTheme?: (input: ChatThemeInput) => void
  onUpdateTheme?: (themeId: string, input: ChatThemeInput) => void
  onDeleteTheme?: (themeId: string) => void
}

const FONT_STACK: Record<string, string> = {
  'plus-jakarta-sans': '"Plus Jakarta Sans", system-ui, sans-serif',
  'ibm-plex-sans': '"IBM Plex Sans", system-ui, sans-serif',
  manrope: 'Manrope, system-ui, sans-serif',
  'source-serif-4': '"Source Serif 4", Georgia, serif',
}

function toInput(t: ChatTheme): ChatThemeInput {
  const { name, headerColor, headerForeground, userBubbleColor, userBubbleForeground, assistantBubbleColor, assistantBubbleForeground, radius, font, placeholder } = t
  return { name, headerColor, headerForeground, userBubbleColor, userBubbleForeground, assistantBubbleColor, assistantBubbleForeground, radius, font, placeholder }
}

function ColorPair({ label, bg, fg, onBg, onFg, disabled }: { label: string; bg: string; fg: string; onBg: (v: string) => void; onFg: (v: string) => void; disabled: boolean }) {
  const r = contrastRatio(bg, fg)
  const ok = r >= 4.5
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={labelClass}>{label}</span>
        <Pill tone={ok ? 'green' : 'red'}>{ok ? <Check className="size-4" strokeWidth={2.5} aria-hidden /> : <AlertTriangle className="size-4" strokeWidth={2} aria-hidden />}{r.toFixed(1)}:1</Pill>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[['Background', bg, onBg], ['Text', fg, onFg]].map(([l, v, fn]) => (
          <label key={l as string} className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white p-1 pr-2 dark:border-gray-700 dark:bg-gray-950">
            <input type="color" aria-label={`${label} ${l}`} disabled={disabled} value={v as string} onChange={(e) => (fn as (v: string) => void)(e.target.value)} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0 disabled:cursor-not-allowed" />
            <span className="flex flex-col leading-tight"><span className="text-xs text-gray-500">{l as string}</span><span className="font-mono text-xs">{v as string}</span></span>
          </label>
        ))}
      </div>
    </div>
  )
}

function Preview({ t }: { t: ChatThemeInput }) {
  const bubble = (user: boolean, text: string) => (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[80%] px-3.5 py-2 text-sm leading-relaxed" style={{ backgroundColor: user ? t.userBubbleColor : t.assistantBubbleColor, color: user ? t.userBubbleForeground : t.assistantBubbleForeground, borderRadius: t.radius, [user ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: Math.min(6, t.radius) } as React.CSSProperties}>{text}</div>
    </div>
  )
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" style={{ fontFamily: FONT_STACK[t.font] }}>
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-3 dark:border-gray-800" style={{ boxShadow: `inset 0 3px 0 ${t.headerColor}` }}>
        <span className="flex size-8 items-center justify-center rounded-lg text-xs font-extrabold" style={{ backgroundColor: t.headerColor, color: t.headerForeground }}>CT</span>
        <div><div className="text-sm font-bold">Claims Triage Assistant</div><div className="text-xs text-gray-600 dark:text-gray-400">Sample conversation</div></div>
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4">
        {bubble(true, 'Triage this claim: day surgery for cataract, invoice SGD 4,200, no pre-authorisation form.')}
        {bubble(false, 'Urgency: Routine. Two documents are missing: the pre-authorisation form and the itemised bill.')}
        {bubble(true, 'Is the form still required for an emergency?')}
        {bubble(false, 'No. For emergency admissions it is waived, but the ED note must be attached.')}
      </div>
      <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2 rounded-2xl border border-gray-300 bg-white py-1.5 pl-4 pr-1.5 dark:border-gray-700 dark:bg-gray-950">
          <span className="flex-1 text-sm text-gray-500">{t.placeholder || 'Ask a question'}</span>
          <span className="flex size-8 items-center justify-center rounded-xl text-white" style={{ backgroundColor: t.userBubbleColor, color: t.userBubbleForeground }}>↑</span>
        </div>
      </div>
    </div>
  )
}

export function ChatThemes({ chatThemes, approvedFonts, solutions, initialThemeId, onCreateTheme, onUpdateTheme, onDeleteTheme }: ChatThemesProps) {
  const def = chatThemes.find((t) => t.isDefault) ?? chatThemes[0]
  const [selectedId, setSelectedId] = useState<string>(initialThemeId ?? def.id)
  const selected = selectedId === 'new' ? null : chatThemes.find((t) => t.id === selectedId) ?? def
  const [draft, setDraft] = useState<ChatThemeInput>(selected ? toInput(selected) : { ...toInput(def), name: 'New theme' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [frame, setFrame] = useState<'phone' | 'desktop'>('desktop')

  const pick = (id: string) => {
    setSelectedId(id)
    setConfirmDelete(false)
    const t = id === 'new' ? null : chatThemes.find((x) => x.id === id)
    setDraft(t ? toInput(t) : { ...toInput(def), name: 'New theme' })
  }
  const set = <K extends keyof ChatThemeInput>(k: K, v: ChatThemeInput[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const isDefault = selected?.isDefault ?? false
  const isNew = selectedId === 'new'
  // Only a chat solution can carry a theme (DEC-26); an embedded one never counts here.
  const usedBy = selected ? solutions.filter((s) => !s.archived && s.type === 'chat' && (s.chatThemeId ?? 'default') === selected.id) : []
  const dirty = selected ? JSON.stringify(toInput(selected)) !== JSON.stringify(draft) : true
  const pairsOk = contrastRatio(draft.headerColor, draft.headerForeground) >= 4.5 && contrastRatio(draft.userBubbleColor, draft.userBubbleForeground) >= 4.5 && contrastRatio(draft.assistantBubbleColor, draft.assistantBubbleForeground) >= 4.5
  const canDelete = selected && !isDefault && usedBy.length === 0

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center gap-2">
        {chatThemes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            aria-pressed={selectedId === t.id}
            className={`inline-flex h-10 items-center gap-2.5 rounded-xl border px-3 text-sm font-medium motion-safe:transition-colors ${focusRing} ${selectedId === t.id ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200'}`}
          >
            <span className="flex -space-x-1">{[t.headerColor, t.userBubbleColor, t.assistantBubbleColor].map((c, i) => <span key={i} className="size-4 rounded-full border-2 border-white dark:border-gray-950" style={{ backgroundColor: c }} />)}</span>
            {t.name}
            {t.isDefault ? <Pill>Default</Pill> : null}
          </button>
        ))}
        <button type="button" onClick={() => pick('new')} aria-pressed={isNew} className={`${btnSecondary} ${isNew ? 'border-blue-600 text-blue-700' : ''}`}><Plus className="size-5" strokeWidth={2} aria-hidden />New theme</button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <Card>
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
            {isDefault ? (
              <div className="rounded-xl bg-gray-50 px-3.5 py-3 text-sm text-gray-700 dark:bg-gray-950/60 dark:text-gray-300">The default theme is the tenant branding. Change it under Branding. Solutions with no theme use it.</div>
            ) : (
              <div className="flex flex-col gap-1.5"><label htmlFor="th-name" className={labelClass}>Theme name</label><input id="th-name" value={draft.name} onChange={(e) => set('name', e.target.value)} className={inputClass} /></div>
            )}
            <ColorPair label="Header" bg={draft.headerColor} fg={draft.headerForeground} onBg={(v) => set('headerColor', v)} onFg={(v) => set('headerForeground', v)} disabled={isDefault} />
            <ColorPair label="Your messages" bg={draft.userBubbleColor} fg={draft.userBubbleForeground} onBg={(v) => set('userBubbleColor', v)} onFg={(v) => set('userBubbleForeground', v)} disabled={isDefault} />
            <ColorPair label="Assistant replies" bg={draft.assistantBubbleColor} fg={draft.assistantBubbleForeground} onBg={(v) => set('assistantBubbleColor', v)} onFg={(v) => set('assistantBubbleForeground', v)} disabled={isDefault} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className={labelClass}>Corner radius <span className="font-mono text-xs font-normal text-gray-500">{draft.radius}px</span></span>
                <input type="range" aria-label="Corner radius" min={0} max={28} step={2} disabled={isDefault} value={draft.radius} onChange={(e) => set('radius', Number(e.target.value))} className="accent-blue-600" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="th-font" className={labelClass}>Font</label>
                <select id="th-font" disabled={isDefault} value={draft.font} onChange={(e) => set('font', e.target.value)} className={`${inputClass} appearance-none`}>
                  {approvedFonts.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5"><label htmlFor="th-ph" className={labelClass}>Input placeholder</label><input id="th-ph" disabled={isDefault} maxLength={140} value={draft.placeholder} onChange={(e) => set('placeholder', e.target.value)} className={inputClass} /><span className={`self-end text-xs tabular-nums ${draft.placeholder.length > 140 ? 'text-red-700' : 'text-gray-500'}`}>{draft.placeholder.length}/140</span></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-3 sm:px-6 dark:border-gray-800">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {isNew ? 'Starts from the tenant branding colors.' : usedBy.length > 0 ? <>Used by {usedBy.length} {usedBy.length === 1 ? 'solution' : 'solutions'}: {usedBy.map((s) => s.name).join(', ')}</> : isDefault ? 'Used by every solution without a theme.' : 'Not used by any solution.'}
            </div>
            <div className="flex items-center gap-2">
              {/* Delete stays visible and disabled for the default or an in-use theme, with the reason in the tooltip. */}
              {!isNew ? (
                <button type="button" className={btnSecondary} disabled={!canDelete} title={isDefault ? 'The tenant branding theme cannot be deleted' : usedBy.length > 0 ? 'Remove it from every solution first' : 'Delete theme'} onClick={() => setConfirmDelete(true)}><Trash2 className="size-5 text-gray-500" strokeWidth={1.75} aria-hidden />Delete</button>
              ) : null}
              {!isDefault ? (
                <button type="button" className={btnPrimary} disabled={!dirty || !pairsOk || !draft.name.trim()} title={pairsOk ? undefined : 'Fix the contrast first'} onClick={() => (isNew ? onCreateTheme?.(draft) : selected?.id && onUpdateTheme?.(selected.id, draft))}>{isNew ? 'Create theme' : 'Save theme'}</button>
              ) : null}
              <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${selected?.name ?? ''}?`} description="The theme is removed for good. No solution uses it, so nothing changes for members." confirmLabel="Delete theme" danger onConfirm={() => { if (selected?.id) onDeleteTheme?.(selected.id); pick(def.id) }} />
            </div>
          </div>
        </Card>
        <div className="flex min-h-[420px] flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">Live preview</span>
            <div role="radiogroup" aria-label="Preview frame" className="inline-flex h-10 items-center rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              {(['phone', 'desktop'] as const).map((f) => <button key={f} type="button" role="radio" aria-checked={frame === f} onClick={() => setFrame(f)} className={`h-8 rounded-md px-2.5 text-xs font-medium capitalize ${focusRing} ${frame === f ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>{f}</button>)}
            </div>
          </div>
          <div className={`flex-1 ${frame === 'phone' ? 'mx-auto w-full max-w-[360px]' : ''}`}><Preview t={draft} /></div>
        </div>
      </div>
    </div>
  )
}
