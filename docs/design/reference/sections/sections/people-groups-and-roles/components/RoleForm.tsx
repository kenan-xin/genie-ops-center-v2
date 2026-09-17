import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ModuleInfo, Role, RoleInput } from '@/../product/sections/people-groups-and-roles/types'
import { btnPrimary, btnSecondary, focusRing, inputClass, labelClass } from './helpers'
import { Dialog, LoadingButton, Pill } from './ui'

export interface RoleFormProps {
  open: boolean
  onClose: () => void
  modules: ModuleInfo[]
  /** Prefill from an existing role: edit (custom) or copy (any). */
  initial?: Role | null
  mode: 'create' | 'edit' | 'copy'
  onSubmit?: (input: RoleInput) => void
  /** For the uniqueness check on the name. */
  existingRoles?: Role[]
}

/** Name, description, and a permission picker grouped by module with select-all per module. */
export function RoleForm({ open, onClose, modules, initial, mode, onSubmit, existingRoles = [] }: RoleFormProps) {
  const [name, setName] = useState(mode === 'copy' && initial ? `${initial.name} (copy)` : initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [perms, setPerms] = useState<string[]>(initial?.permissions ?? [])
  const toggle = (k: string) => setPerms((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))
  const title = mode === 'create' ? 'New role' : mode === 'edit' ? 'Edit role' : 'Copy role'
  const duplicate = existingRoles.some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase() && !(mode === 'edit' && r.id === initial?.id))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="A role is a named set of permission keys. Assign it to groups or people afterwards."
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <LoadingButton className={btnPrimary} disabled={!name.trim() || duplicate || perms.length === 0} onPress={() => { onSubmit?.({ name: name.trim(), description: description.trim(), permissions: perms }); onClose() }}>
            {mode === 'edit' ? 'Save changes' : 'Create role'}
          </LoadingButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-name" className={labelClass}>Name</label>
          <input id="rf-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Claims supervisor" aria-invalid={duplicate || undefined} aria-describedby={duplicate ? 'rf-name-error' : undefined} className={inputClass} />
          {duplicate ? <p id="rf-name-error" className="text-xs text-red-700 dark:text-red-300">A role named “{name.trim()}” already exists. Pick another name.</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-desc" className={labelClass}>Description</label>
          <textarea id="rf-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this role is for" className={`${inputClass} h-auto py-2`} />
        </div>
        <div className="flex flex-col gap-2">
          <span className={labelClass}>Permissions <span className="font-normal text-gray-500">({perms.length} selected)</span></span>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800">
            {modules.map((m) => {
              const keys = m.permissionKeys.map((k) => k.key)
              const all = keys.every((k) => perms.includes(k))
              return (
                <fieldset key={m.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <legend className="sr-only">{m.name}</legend>
                  <div className="flex items-center gap-2 bg-gray-50 px-3.5 py-2 dark:bg-gray-950/50">
                    <span className="text-sm font-semibold">{m.name}</span>
                    <Pill tone={m.entitled ? 'emerald' : 'gray'}>{m.entitled ? 'Entitled' : 'Not entitled'}</Pill>
                    <button type="button" className={`ml-auto rounded text-xs font-medium text-blue-700 hover:underline dark:text-blue-400 ${focusRing}`} onClick={() => setPerms((s) => (all ? s.filter((k) => !keys.includes(k)) : Array.from(new Set([...s, ...keys]))))}>
                      {all ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                  {m.permissionKeys.map((k) => (
                    <label key={k.key} className="flex cursor-pointer items-center gap-3 px-3.5 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/60">
                      <input type="checkbox" checked={perms.includes(k.key)} onChange={() => toggle(k.key)} className={`size-4 rounded border-gray-300 accent-blue-600 ${focusRing}`} />
                      <span className="flex-1">{k.label}</span>
                      <code className="font-mono text-xs text-gray-500">{k.key}</code>
                      {!m.entitled && perms.includes(k.key) ? <AlertTriangle className="size-4 shrink-0 text-amber-600" strokeWidth={2} aria-label="Module not entitled" /> : null}
                    </label>
                  ))}
                </fieldset>
              )
            })}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
