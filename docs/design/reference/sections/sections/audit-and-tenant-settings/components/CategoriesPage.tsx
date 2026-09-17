import { useCallback, useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { Category, CompiledModule } from '@/../product/sections/audit-and-tenant-settings/types'
import { btnGhost, btnPrimary, focusRing, inputClass } from './helpers'
import { BottomBar, Card, ConfirmDialog, Pill, Toast } from './ui'

export interface CategoriesPageProps {
  categories: Category[]
  modules: CompiledModule[]
  ungroupedSolutionCount: number
  onCreateCategory?: (name: string) => void
  onRenameCategory?: (categoryId: string, name: string) => void
  onReorderCategories?: (orderedIds: string[]) => void
  onDeleteCategory?: (categoryId: string) => void
  /** Design-only: open the delete confirm for this category on load. */
  initialConfirmId?: string
}

const SAVED = 'Saved. Written to the audit log.'
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

function Counts({ solutions, modules }: { solutions: number; modules: number }) {
  return <><Pill>{n(solutions, 'solution', 'solutions')}</Pill><Pill>{n(modules, 'module', 'modules')}</Pill></>
}

/** Core categories (DEC-51): one ordered list that groups solutions and modules alike. */
export function CategoriesPage({ categories, modules, ungroupedSolutionCount, onCreateCategory, onRenameCategory, onReorderCategories, onDeleteCategory, initialConfirmId }: CategoriesPageProps) {
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(initialConfirmId ?? null)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const closeConfirm = useCallback(() => setConfirmId(null), [])
  const ordered = categories.slice().sort((a, b) => a.position - b.position)
  const otherModules = modules.filter((m) => !m.categoryId || !categories.some((c) => c.id === m.categoryId)).length
  const confirming = categories.find((c) => c.id === confirmId)

  const create = () => { if (!name.trim()) return; onCreateCategory?.(name.trim()); setName(''); setToast(SAVED) }
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ordered.length || from === to) return
    const ids = ordered.map((c) => c.id)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    onReorderCategories?.(ids)
    setToast(SAVED)
  }
  const drop = (targetId: string) => {
    if (dragId && dragId !== targetId) move(ordered.findIndex((c) => c.id === dragId), ordered.findIndex((c) => c.id === targetId))
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-8">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); create() }}>
        <input aria-label="New category name" value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, for example Operations" className={inputClass} />
        {/* Under md the primary action moves to the sticky bottom bar (DEC-25). */}
        <button type="submit" className={`${btnPrimary} hidden md:inline-flex`} disabled={!name.trim()}><Plus className="size-5" strokeWidth={2} aria-hidden />Add</button>
      </form>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {ordered.map((c, i) => {
            const isEditing = editing === c.id
            return (
              <li
                key={c.id}
                draggable={!isEditing}
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => { e.preventDefault(); setOverId(c.id) }}
                onDrop={() => drop(c.id)}
                onDragEnd={() => { setDragId(null); setOverId(null) }}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 motion-safe:transition-colors sm:flex-nowrap ${dragId === c.id ? 'opacity-40' : ''} ${overId === c.id && dragId && dragId !== c.id ? 'shadow-[inset_0_2px_0_#2563eb]' : ''}`}
              >
                <span className="cursor-grab text-gray-500 active:cursor-grabbing" aria-hidden><GripVertical className="size-4" strokeWidth={1.75} /></span>
                <span className="flex flex-col">
                  <button type="button" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className={`flex size-5 items-center justify-center rounded text-gray-500 hover:text-gray-900 disabled:opacity-30 dark:hover:text-gray-100 ${focusRing}`}><ChevronUp className="size-4" strokeWidth={2} /></button>
                  <button type="button" aria-label={`Move ${c.name} down`} disabled={i === ordered.length - 1} onClick={() => move(i, i + 1)} className={`flex size-5 items-center justify-center rounded text-gray-500 hover:text-gray-900 disabled:opacity-30 dark:hover:text-gray-100 ${focusRing}`}><ChevronDown className="size-4" strokeWidth={2} /></button>
                </span>
                {isEditing ? (
                  <input
                    autoFocus
                    aria-label="Category name"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => { if (editValue.trim() && editValue.trim() !== c.name) { onRenameCategory?.(c.id, editValue.trim()); setToast(SAVED) } setEditing(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }}
                    className={`${inputClass} min-w-0 flex-1 sm:max-w-sm`}
                  />
                ) : (
                  <button type="button" onClick={() => { setEditing(c.id); setEditValue(c.name) }} className={`min-h-11 min-w-0 flex-1 truncate rounded-xl px-2 py-1 text-left text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 ${focusRing}`} title="Click to rename">{c.name}</button>
                )}
                <span className="flex basis-full items-center gap-2 pl-12 sm:basis-auto sm:pl-0">
                  <Counts solutions={c.solutionCount} modules={c.moduleCount} />
                  <button type="button" aria-label={`Delete ${c.name}`} title="Delete category" onClick={() => setConfirmId(c.id)} className={`${btnGhost} ml-auto size-11 justify-center px-0 text-gray-500 hover:text-red-700 sm:size-8`}>
                    <Trash2 className="size-4" strokeWidth={1.75} />
                  </button>
                </span>
              </li>
            )
          })}
          <li className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-gray-50 px-3 py-2.5 sm:flex-nowrap dark:bg-gray-950/50">
            <span className="w-4" /><span className="w-5" />
            <span className="min-h-11 flex-1 px-2 text-sm font-semibold leading-11 text-gray-600 dark:text-gray-400">Other</span>
            <span className="flex basis-full items-center gap-2 pl-12 sm:basis-auto sm:pl-0"><Counts solutions={ungroupedSolutionCount} modules={otherModules} /><span className="ml-auto size-11 sm:size-8" /></span>
          </li>
        </ul>
        <div className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-400">Drag or use the arrows to reorder. Click a name to rename it. Deleting a category leaves its solutions and modules ungrouped under Other; nothing else is removed.</div>
      </Card>
      <BottomBar><button type="button" className={btnPrimary} disabled={!name.trim()} onClick={create}><Plus className="size-5" strokeWidth={2} aria-hidden />Add</button></BottomBar>

      <ConfirmDialog
        open={Boolean(confirming)}
        title={`Delete ${confirming?.name ?? ''}?`}
        description={`${n(confirming?.solutionCount ?? 0, 'solution', 'solutions')} and ${n(confirming?.moduleCount ?? 0, 'module', 'modules')} become ungrouped. Nothing is deleted with it.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirming) { onDeleteCategory?.(confirming.id); setToast(SAVED) } setConfirmId(null) }}
        onClose={closeConfirm}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}
