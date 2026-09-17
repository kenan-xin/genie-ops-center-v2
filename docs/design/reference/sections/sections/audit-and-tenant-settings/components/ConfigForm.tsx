import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ConfigField, ConfigValue } from '@/../product/sections/audit-and-tenant-settings/types'
import { btnGhost, inputClass, labelClass } from './helpers'
import { SwitchRow } from './ui'

export interface ConfigFormProps {
  schema: ConfigField[]
  values: Record<string, ConfigValue>
  onChange: (values: Record<string, ConfigValue>) => void
  /** Validation messages by key. Shown under the field once it was touched. */
  errors: Record<string, string | null>
}

/** Renders the five supported field kinds from a module's configuration schema (DEC-28). Never a form engine. */
export function ConfigForm({ schema, values, onChange, errors }: ConfigFormProps) {
  // A stored value that already fails the schema shows its message at once; everything else waits for blur.
  const [touched, setTouched] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, Boolean(v)])))
  const set = (key: string, v: ConfigValue) => onChange({ ...values, [key]: v })
  const touch = (key: string) => setTouched((t) => ({ ...t, [key]: true }))
  const err = (key: string) => (touched[key] ? errors[key] : null)

  return (
    <div className="flex flex-col gap-5">
      {schema.map((field) => {
        const id = `cfg-${field.key}`
        const message = err(field.key)
        const describedBy = message ? `${id}-e` : `${id}-d`
        const head = (
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={id} className={labelClass}>{field.title}{field.required ? <span className="text-red-600"> *</span> : null}</label>
            {field.kind === 'string' && field.maxLength !== undefined ? <span className={`text-xs ${String(values[field.key] ?? '').length > field.maxLength ? 'text-red-600' : 'text-gray-500'}`}>{String(values[field.key] ?? '').length}/{field.maxLength}</span> : null}
          </div>
        )
        // Number: min and max are part of the description (spec).
        const range = field.kind === 'number' && (field.min !== undefined || field.max !== undefined) ? ` ${field.min !== undefined && field.max !== undefined ? `From ${field.min.toLocaleString('en-GB')} to ${field.max.toLocaleString('en-GB')}` : field.min !== undefined ? `At least ${field.min.toLocaleString('en-GB')}` : `At most ${field.max!.toLocaleString('en-GB')}`}.` : ''
        const desc = <p id={`${id}-d`} className="text-xs text-gray-600 dark:text-gray-400">{field.description}{range}</p>
        const error = message ? <p id={`${id}-e`} role="alert" className="text-xs text-red-700">{message}</p> : null

        if (field.kind === 'boolean') {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <SwitchRow label={field.title} description={field.description} checked={values[field.key] === true} onChange={(v) => { set(field.key, v); touch(field.key) }} />
              {error}
            </div>
          )
        }
        if (field.kind === 'string') {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              {head}
              <input id={id} value={String(values[field.key] ?? '')} onChange={(e) => set(field.key, e.target.value)} onBlur={() => touch(field.key)} className={inputClass} aria-invalid={Boolean(message)} aria-describedby={describedBy} />
              {error ?? desc}
            </div>
          )
        }
        if (field.kind === 'number') {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              {head}
              <input id={id} type="number" inputMode="decimal" min={field.min} max={field.max} step={field.step} value={values[field.key] === undefined ? '' : String(values[field.key])} onChange={(e) => set(field.key, e.target.value === '' ? '' : Number(e.target.value))} onBlur={() => touch(field.key)} className={`${inputClass} font-mono sm:max-w-[240px]`} aria-invalid={Boolean(message)} aria-describedby={describedBy} />
              {error ?? desc}
            </div>
          )
        }
        if (field.kind === 'enum') {
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              {head}
              <select id={id} value={String(values[field.key] ?? '')} onChange={(e) => { set(field.key, e.target.value); touch(field.key) }} className={`${inputClass} appearance-none sm:max-w-[320px]`} aria-invalid={Boolean(message)} aria-describedby={describedBy}>
                <option value="" disabled={field.required}>Select…</option>
                {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {error ?? desc}
            </div>
          )
        }
        // string-list
        const list = Array.isArray(values[field.key]) ? (values[field.key] as string[]) : []
        const atLimit = field.itemLimit !== undefined && list.length >= field.itemLimit
        const re = field.pattern ? new RegExp(field.pattern) : null
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className={labelClass}>{field.title}</span>
              {field.itemLimit !== undefined ? <span className={`text-xs ${list.length > field.itemLimit ? 'text-red-600' : 'text-gray-500'}`}>{list.length}/{field.itemLimit}</span> : null}
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((item, i) => {
                const bad = touched[field.key] && re && item.trim() && !re.test(item.trim())
                return (
                  <li key={i} className="flex items-center gap-2">
                    <input aria-label={`${field.title} ${i + 1}`} value={item} placeholder={field.placeholder} onChange={(e) => set(field.key, list.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => touch(field.key)} className={`${inputClass} font-mono`} aria-invalid={Boolean(bad)} />
                    <button type="button" aria-label={`Remove entry ${i + 1}`} onClick={() => { set(field.key, list.filter((_, j) => j !== i)); touch(field.key) }} className={`${btnGhost} size-11 shrink-0 justify-center px-0 text-gray-500 hover:text-red-700 sm:size-10`}><Trash2 className="size-5" strokeWidth={1.75} /></button>
                  </li>
                )
              })}
            </ul>
            <button type="button" disabled={atLimit} title={atLimit ? `At most ${field.itemLimit} entries` : undefined} onClick={() => set(field.key, [...list, ''])} className={`${btnGhost} w-fit text-blue-700 dark:text-blue-400`}><Plus className="size-5" strokeWidth={2} aria-hidden />Add entry</button>
            {error ?? desc}
          </div>
        )
      })}
    </div>
  )
}
