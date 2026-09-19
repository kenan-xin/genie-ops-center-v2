import { useEffect, useState } from 'react'

/**
 * Preview-only shared state, for the Design OS previews alone.
 *
 * The product reads `category` and `tenant_module.category_id` from the server, and it asks each
 * enabled module for the records the module lets an administrator file. Three screens place an item
 * in a category: Categories, Modules, and the solution configure sheet. They must agree, and a
 * Design OS preview is a fresh page load each time, so the preview keeps one record in
 * `localStorage`.
 *
 * No file under `src/sections/<id>/components` imports this module. It is preview wiring, not part
 * of any exported component, and it never ships.
 */
export interface DemoCategory {
  id: string
  name: string
  position: number
}

export interface DemoNav {
  /** Null means "use the sample data as it ships". */
  categories: DemoCategory[] | null
  /** Item id to category id, or null for no category. Modules and module records alike. */
  items: Record<string, string | null>
  /** Module id to `tenant_module.enabled`, for the modules the preview switched. */
  enabled: Record<string, boolean>
}

const KEY = 'genie.demo.nav'
const EVENT = 'genie-demo-nav'
const EMPTY: DemoNav = { categories: null, items: {}, enabled: {} }

export function readDemoNav(): DemoNav {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<DemoNav>
    return { categories: parsed.categories ?? null, items: parsed.items ?? {}, enabled: parsed.enabled ?? {} }
  } catch {
    return EMPTY
  }
}

export function writeDemoNav(next: DemoNav) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // A browser with storage switched off keeps the change for this page only.
  }
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** `?reset=1` on any of the three screens puts the sample tenant back. */
export function resetDemoNav() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** Reads the shared record and re-renders when this screen, another screen, or another tab writes it. */
export function useDemoNav(): [DemoNav, (next: DemoNav) => void] {
  const [state, setState] = useState(readDemoNav)
  useEffect(() => {
    const sync = () => setState(readDemoNav())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [state, (next: DemoNav) => { writeDemoNav(next); setState(next) }]
}

/**
 * Call once at module scope in a preview wrapper: `?reset=1` puts the sample tenant back before the
 * first read, so the reset is visible on the first render.
 */
export function resetDemoNavIfRequested() {
  if (typeof window === 'undefined') return
  if (new URLSearchParams(window.location.search).get('reset') !== '1') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/** The category of one item, falling back to the value the sample data ships. */
export function categoryOf(nav: DemoNav, itemId: string, fallback: string | null): string | null {
  return itemId in nav.items ? nav.items[itemId] : fallback
}
