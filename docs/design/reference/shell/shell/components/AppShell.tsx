import { useEffect, useState } from 'react'
import { Menu, WifiOff, X } from 'lucide-react'
import { MainNav, type NavCategory, type NavTree, type NavigationItem } from './MainNav'
import { UserMenu, type ShellUser } from './UserMenu'
import { focusRing } from './helpers'

export type ShellMode = 'workspace' | 'admin'

export interface ShellTenant {
  name: string
  logoUrl?: string
  productName?: string
}

export interface AppShellProps {
  children: React.ReactNode
  /** `workspace` for members (modules, favorites). `admin` for the admin portal. Each has its own nav. */
  mode?: ShellMode
  navigationItems: NavigationItem[]
  /** Workspace only. The navigation tree: pinned rail (at most six) and solution and module entries the person may reach (DEC-51). */
  tree?: NavTree
  /** Workspace only. Core categories that group the tree's entries, in position order. */
  categories?: NavCategory[]
  tenant?: ShellTenant
  user?: ShellUser
  /** Present only when the person holds a core admin permission and may enter the other chrome. */
  switchTarget?: { label: string; href: string }
  /** Local-account tenants only: realm account page for password changes. Shown in the user menu. */
  changePasswordHref?: string
  pageTitle?: string
  pageDescription?: string
  /** Right side of the header on tablet and desktop: search, actions. Rendered in the sticky bottom bar on phones when `bottomBar` is not given. */
  headerActions?: React.ReactNode
  /** Phone only: a sticky bottom bar for the page's primary action. */
  bottomBar?: React.ReactNode
  /** Focus mode (viewer): hides the sidebar and header so the page takes the full width. The page renders its own Exit focus control. */
  focus?: boolean
  /** Shows skeleton rows in place of the page while it loads. */
  loading?: boolean
  /** Overrides the browser offline state, for previews. */
  offline?: boolean
  supportHref?: string
  onNavigate?: (href: string) => void
  /** Ends the Genie session and then the realm session. */
  onLogout?: () => void
}

/*
 * Mobile first. The base layout is a 54px header (tenant mark, title, hamburger), the page,
 * and an optional sticky bottom bar. The hamburger opens a full-height drawer capped at 84vw.
 * From lg the drawer becomes a 240px sidebar panel and the header grows a description and actions.
 * Language: white page, soft gray panel, hairline borders, rounded rows, blue for actions and active.
 */

function TenantMark({ tenant, size = 'md' }: { tenant?: ShellTenant; size?: 'sm' | 'md' }) {
  const name = tenant?.name ?? 'Genie'
  const cls = size === 'sm' ? 'size-8 rounded-lg text-sm' : 'size-10 rounded-xl text-base'
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 ${cls}`}>
      {tenant?.logoUrl ? <img src={tenant.logoUrl} alt="" className="size-[70%] object-contain" /> : <span aria-hidden className="font-extrabold text-blue-600 dark:text-blue-400">{name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

function TenantBlock({ tenant, mode }: { tenant?: ShellTenant; mode: ShellMode }) {
  const name = tenant?.name ?? 'Genie'
  return (
    <div className="flex items-center gap-3 px-3 pb-2 pt-3">
      <TenantMark tenant={tenant} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold tracking-tight text-gray-900 dark:text-gray-100">{name}</span>
        {mode === 'admin' ? (
          <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-px text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <span aria-hidden className="size-1.5 rounded-full bg-gray-500" />Admin portal
          </span>
        ) : tenant?.productName ? (
          <span className="block truncate text-xs text-gray-600 dark:text-gray-400">{tenant.productName}</span>
        ) : null}
      </span>
    </div>
  )
}

export function AppShell({
  children,
  mode = 'workspace',
  navigationItems,
  tree,
  categories,
  tenant,
  user,
  switchTarget,
  changePasswordHref,
  pageTitle,
  pageDescription,
  headerActions,
  bottomBar,
  focus = false,
  loading = false,
  offline,
  supportHref,
  onNavigate,
  onLogout,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [browserOffline, setBrowserOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  useEffect(() => {
    const on = () => setBrowserOffline(false)
    const off = () => setBrowserOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const isOffline = offline ?? browserOffline
  const activeLabel = navigationItems.find((i) => i.isActive)?.label
  const title = pageTitle ?? activeLabel ?? (mode === 'admin' ? 'Admin' : 'Workspace')

  const navigate = (href: string) => {
    setDrawerOpen(false)
    onNavigate?.(href)
  }
  const items = mode === 'workspace' ? navigationItems.map((i) => ({ section: 'Workspace', ...i })) : navigationItems

  const navPanel = (
    <>
      <TenantBlock tenant={tenant} mode={mode} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <MainNav items={items} tree={mode === 'workspace' ? tree : undefined} categories={mode === 'workspace' ? categories : undefined} onNavigate={navigate} />
      </div>
      {user ? <UserMenu user={user} supportHref={supportHref} switchTarget={switchTarget} changePasswordHref={changePasswordHref} accountHref={mode === 'admin' ? '/admin/account' : '/account'} onNavigate={navigate} onLogout={onLogout} /> : null}
    </>
  )

  const mobileActions = bottomBar ?? headerActions

  const skeleton = (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <span className="sr-only">Loading</span>
      <div className="h-10 w-full max-w-sm rounded-xl bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" />
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 last:border-0 dark:border-gray-800">
            <div className="size-10 rounded-full bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" />
            <div className="flex-1 space-y-2"><div className="h-3.5 w-1/3 rounded-full bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" /><div className="h-3 w-1/2 rounded-full bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" /></div>
            <div className="h-6 w-16 rounded-full bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white font-[Plus_Jakarta_Sans] text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
      {/* Offline bar: pinned at the top of the viewport (the root never scrolls), full width in both chromes, pushes everything below it down by its height. */}
      {isOffline ? (
        <div role="status" aria-live="polite" className="z-50 flex min-h-10 shrink-0 items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">
          <WifiOff className="size-4 shrink-0" strokeWidth={2} aria-hidden />You are offline. Changes will not be saved until the connection returns.
        </div>
      ) : null}
      <div className={`flex min-h-0 flex-1 flex-col ${focus ? '' : 'lg:flex-row lg:gap-3 lg:p-3'}`}>
      {/* Desktop sidebar, lg and up. Hidden in focus mode. */}
      {!focus ? <aside className="hidden w-60 shrink-0 flex-col rounded-2xl border border-gray-200 bg-gray-50 lg:flex dark:border-gray-800 dark:bg-gray-900">{navPanel}</aside> : null}

      {/* Drawer, phone and tablet */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className={`absolute inset-0 bg-gray-900/40 backdrop-blur-[2px] ${focusRing}`} />
          <aside className="absolute inset-y-0 left-0 flex w-[84vw] max-w-[320px] flex-col bg-gray-50 shadow-2xl dark:bg-gray-900">
            <div className="flex justify-end px-2 pt-2">
              <button type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className={`flex size-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-50 active:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900 dark:active:bg-gray-800 ${focusRing}`}><X className="size-5" strokeWidth={1.75} /></button>
            </div>
            {navPanel}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Phone header: mark, title, hamburger. Grows on lg. Hidden in focus mode, where the page owns its header. */}
        {focus ? null : (
        <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-gray-200 px-4 md:px-6 lg:h-auto lg:items-start lg:border-0 lg:px-8 lg:pb-4 lg:pt-2 dark:border-gray-800">
          <button type="button" aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={drawerOpen} onClick={() => setDrawerOpen((v) => !v)} className={`-ml-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-gray-700 hover:bg-gray-50 active:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-900 dark:active:bg-gray-800 ${focusRing}`}>
            <Menu className="size-5" strokeWidth={1.75} />
          </button>
          <span className="lg:hidden"><TenantMark tenant={tenant} size="sm" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold leading-tight tracking-tight lg:text-xl">{title}</h1>
            {pageDescription ? <p className="mt-0.5 hidden truncate text-sm text-gray-600 lg:block dark:text-gray-400">{pageDescription}</p> : null}
          </div>
          {headerActions ? <div className="hidden shrink-0 items-center gap-2 md:flex">{headerActions}</div> : null}
        </header>
        )}
        <main className={`min-h-0 flex-1 overflow-auto ${focus ? 'p-0' : 'px-4 pb-4 pt-4 md:px-6 lg:px-8 lg:pb-2 lg:pt-0'}`}>{loading ? skeleton : children}</main>
        {mobileActions ? (
          <div className="sticky bottom-0 flex shrink-0 items-center gap-2 border-t border-gray-200 bg-white/95 px-4 py-2 backdrop-blur md:hidden dark:border-gray-800 dark:bg-gray-950/95">{mobileActions}</div>
        ) : null}
      </div>
      </div>
    </div>
  )
}
